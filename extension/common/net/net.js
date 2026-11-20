// net.js (claude-ext-common)
// Helpers for code that intercepts claude.ai's requests: fetch arguments, API URLs, rebuilt
// responses, gzipped request bodies, SSE streams, and the bard API's Connect-RPC frames and protobuf
// messages (decodeBard needs net/bard-schema.js loaded too).
//
// Unlike the rest of common, this is an IIFE that publishes into ONE namespace, globalThis.ClaudeExtNet.
// Every extension may load it into the shared MAIN world (and the tracker's background imports it too),
// so it is versioned and the NEWEST copy wins, whatever the load order: it replaces the members of an
// older copy on the same object (callers keep a reference to the object, and look members up at call
// time), and an older copy loading after it leaves everything alone. So:
// - bump VERSION with every change to this file;
// - an older extension runs your members: fix and extend them, but never remove one or change its
//   parameters or what it returns in a way an older caller would trip over.
(function () {
	'use strict';

	const VERSION = 5; // 1: the unversioned first release, which filled members with ??=; 3: bard decoding; 4: bard encoding, frame rewriting; 5: bardRpcRequest

	const existing = globalThis.ClaudeExtNet;
	if (existing && (existing.VERSION ?? 1) >= VERSION) return;
	const net = existing ?? (globalThis.ClaudeExtNet = {});
	net.VERSION = VERSION;

	// ======== fetch arguments ========

	// The absolute URL of a fetch() input (string, URL or Request). Relative URLs resolve the way
	// fetch() resolves them: against the document's base URL, so 'api/x' on /chat/123 is
	// /chat/api/x. '' for anything else.
	net.getFetchUrl = function (input) {
		let url;
		if (typeof input === 'string') url = input;
		else if (input instanceof URL) url = input.href;
		else if (typeof Request !== 'undefined' && input instanceof Request) url = input.url;
		else return '';
		try {
			return new URL(url, globalThis.document?.baseURI ?? globalThis.location?.href).href;
		} catch (e) {
			return url;
		}
	};

	// The upper-cased HTTP method of a fetch() call: init.method, else the Request's, else GET.
	net.getFetchMethod = function (input, init) {
		const method = init?.method
			?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');
		return String(method).toUpperCase();
	};

	// ======== claude.ai API URLs ========

	// { orgId, conversationId } from an API URL (/organizations/<id>/chat_conversations/<id>/...).
	// Either is null when the URL doesn't have it.
	net.getApiIds = function (url) {
		const path = String(url).split('?')[0];
		return {
			orgId: path.match(/\/organizations\/([^/]+)/)?.[1] ?? null,
			conversationId: path.match(/\/chat_conversations\/([^/]+)/)?.[1] ?? null,
		};
	};

	// Whether a URL is a message send (.../completion). With { retry: true }, also a regenerate
	// (.../retry_completion). The retry choice is explicit because callers differ on purpose.
	net.isCompletionUrl = function (url, { retry = false } = {}) {
		const path = String(url).split('?')[0];
		return path.endsWith('/completion') || (retry && path.endsWith('/retry_completion'));
	};

	// ======== rebuilt responses ========

	// A response's headers, minus the ones that describe the original body's encoding and length.
	// fetch() has already decoded the body by the time we read it, so a rebuilt response that kept
	// content-encoding would claim a compression its body no longer has.
	net.sanitizedHeaders = function (response) {
		const headers = new Headers(response.headers);
		headers.delete('content-encoding');
		headers.delete('content-length');
		headers.delete('transfer-encoding');
		return headers;
	};

	// A copy of response carrying `data` as its JSON body.
	net.jsonResponse = function (response, data) {
		return new Response(JSON.stringify(data), {
			status: response.status,
			statusText: response.statusText,
			headers: net.sanitizedHeaders(response),
		});
	};

	// ======== request bodies ========

	// claude.ai gzips some request bodies itself (Content-Encoding: gzip, body is bytes, not a string).
	net.isGzipRequest = function (init) {
		return new Headers(init?.headers || {}).get('content-encoding')?.toLowerCase() === 'gzip';
	};

	// Parse a fetch init's JSON body, whether it's a string or (gzipped) bytes.
	net.readJsonRequestBody = async function (init) {
		const body = init?.body;
		if (typeof body === 'string') return JSON.parse(body);
		let stream = new Response(body).body;
		if (net.isGzipRequest(init)) stream = stream.pipeThrough(new DecompressionStream('gzip'));
		return JSON.parse(await new Response(stream).text());
	};

	// A copy of init with `data` as its body, in the same encoding (plain or gzip) the original used.
	net.withJsonRequestBody = async function (init, data) {
		const json = JSON.stringify(data);
		if (!net.isGzipRequest(init)) return { ...init, body: json };
		const compressed = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
		return { ...init, body: await new Response(compressed).arrayBuffer() };
	};

	// Whether bytes start with the gzip magic number.
	net.isGzipBytes = function (bytes) {
		return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
	};

	// Inflate gzipped bytes. DecompressionStream only knows gzip/deflate, not br or zstd.
	net.gunzipBytes = async function (bytes) {
		const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	};

	// ======== SSE ========

	// One SSE event: { raw, event, dataText, data }. `raw` is the event's text without the blank line
	// that ended it; `data` is the data: lines parsed as JSON (null if absent or not JSON), parsed on
	// first access so callers that only look at `raw` don't pay for it.
	function parseSseEvent(raw) {
		let event = null;
		const dataLines = [];
		for (const line of raw.split(/\r?\n/)) {
			if (line.startsWith('data:')) dataLines.push(line.slice(line[5] === ' ' ? 6 : 5));
			else if (line.startsWith('event:')) event = line.slice(6).trim();
		}
		const dataText = dataLines.length ? dataLines.join('\n') : null;
		let parsed;
		return {
			raw,
			event,
			dataText,
			get data() {
				if (parsed === undefined) {
					try {
						parsed = dataText === null ? null : JSON.parse(dataText);
					} catch (e) {
						parsed = null;
					}
				}
				return parsed;
			},
		};
	}

	// Incremental SSE splitting for code that drives its own reader: push() decoded text and get
	// back the events it completed; flush() returns whatever is left once the stream ends. Events
	// end at a blank line (\n\n or \r\n\r\n), so one straddling two chunks is still whole.
	net.createSseSplitter = function () {
		let buffer = '';
		const boundary = /\r?\n\r?\n/;
		return {
			push(text) {
				buffer += text;
				const events = [];
				let match;
				while ((match = boundary.exec(buffer))) {
					events.push(parseSseEvent(buffer.slice(0, match.index)));
					buffer = buffer.slice(match.index + match[0].length);
				}
				return events;
			},
			flush() {
				const rest = buffer;
				buffer = '';
				return rest.trim() ? [parseSseEvent(rest)] : [];
			},
			get bufferedChars() {
				return buffer.length;
			},
		};
	};

	// Read an SSE body (a Response or a ReadableStream) to the end, calling onEvent for every event.
	// Return false from onEvent to stop early: the stream is cancelled (not awaited), so a clone or tee branch stops
	// buffering the rest of the body. Also stops (and cancels) if a single unfinished event grows past
	// maxBufferedChars. Resolves true if the stream was read to the end, false if it stopped early.
	// Stream errors (an aborted request) reject, after the events that did arrive were delivered.
	net.readSseEvents = async function (source, onEvent, { maxBufferedChars = Infinity } = {}) {
		const reader = (typeof Response !== 'undefined' && source instanceof Response ? source.body : source).getReader();
		const decoder = new TextDecoder();
		const splitter = net.createSseSplitter();
		// Cancel without waiting: on a clone() or tee branch the cancel only settles once the other
		// branch finishes too, which for a live completion is the end of the whole reply.
		const stop = () => { reader.cancel().catch(() => { }); };
		try {
			for (;;) {
				const { done, value } = await reader.read();
				const events = done
					? [...splitter.push(decoder.decode()), ...splitter.flush()]
					: splitter.push(decoder.decode(value, { stream: true }));
				for (const event of events) {
					if (onEvent(event) === false) {
						stop();
						return false;
					}
				}
				if (done) return true;
				if (splitter.bufferedChars > maxBufferedChars) {
					stop();
					return false;
				}
			}
		} finally {
			reader.releaseLock();
		}
	};

	// ======== Connect-RPC frames ========

	// Connect streaming bodies (application/connect+proto) are a run of frames:
	// flags(1) + length(4, big-endian) + payload. Flag 0x01 = gzipped payload, 0x02 = end of stream
	// (the payload is JSON trailers). Unary calls (application/proto) are one bare message instead.
	const FRAME_GZIP = 0x01;
	const FRAME_END = 0x02;
	const frameLength = (b, i) => ((b[i + 1] << 24) | (b[i + 2] << 16) | (b[i + 3] << 8) | b[i + 4]) >>> 0;

	// The frames of an already-complete buffer (a framed request body, a captured response), as
	// { flags, payload }. Payloads are NOT gunzipped (that's async: see gunzipBytes); a truncated last
	// frame is dropped.
	net.splitConnectFrames = function (bytes) {
		const frames = [];
		let i = 0;
		while (i + 5 <= bytes.length) {
			const len = frameLength(bytes, i);
			if (i + 5 + len > bytes.length) break;
			frames.push({ flags: bytes[i], payload: bytes.subarray(i + 5, i + 5 + len) });
			i += 5 + len;
		}
		return frames;
	};

	// Reassembles frames from stream chunks: push() chunks in, take() complete frames out as
	// { flags, frame, payload } (frame = the whole frame's bytes, a copy; payload = its still-compressed
	// payload inside it), or null until more bytes arrive. tooLong is set, and take() returns null, once
	// a header announces a payload over maxFrameBytes. rest() is whatever incomplete bytes are left.
	function frameBuffer(maxFrameBytes = Infinity) {
		let buffer = new Uint8Array(0), at = 0;
		return {
			tooLong: false,
			push(chunk) {
				const left = buffer.length - at;
				if (!left) {
					buffer = chunk;
				} else {
					const joined = new Uint8Array(left + chunk.length);
					joined.set(buffer.subarray(at));
					joined.set(chunk, left);
					buffer = joined;
				}
				at = 0;
			},
			take() {
				if (buffer.length - at < 5) return null;
				const len = frameLength(buffer, at);
				if (len > maxFrameBytes) {
					this.tooLong = true;
					return null;
				}
				if (buffer.length - at < 5 + len) return null;
				const frame = buffer.slice(at, at + 5 + len);
				at += 5 + len;
				return { flags: frame[0], frame, payload: frame.subarray(5) };
			},
			rest() {
				return buffer.slice(at);
			},
		};
	}

	// A taken frame as { endStream, payload, trailers }: payload gunzipped; trailers parsed for the
	// end-of-stream frame ({} if unparseable), otherwise null.
	async function openFrame({ flags, payload }) {
		const data = flags & FRAME_GZIP ? await net.gunzipBytes(payload) : payload;
		let trailers = null;
		if (flags & FRAME_END) {
			try {
				trailers = data.length ? JSON.parse(new TextDecoder().decode(data)) : {};
			} catch (e) {
				trailers = {};
			}
		}
		return { endStream: !!(flags & FRAME_END), payload: data, trailers };
	}

	// Read a Connect streaming body (a Response or a ReadableStream) to the end, calling onFrame for
	// every frame with { endStream, payload, trailers }: payload already gunzipped; for the end-of-stream
	// frame, trailers is its parsed JSON ({} if unparseable), otherwise null. Frames split across chunks
	// are reassembled. Return false from onFrame to stop early; a frame longer than maxFrameBytes stops
	// it too. Both cancel the stream without waiting (see readSseEvents) and resolve false. Resolves true
	// at the end of the stream. Stream errors reject, after the frames that did arrive were delivered.
	net.readConnectFrames = async function (source, onFrame, { maxFrameBytes = Infinity } = {}) {
		const reader = (typeof Response !== 'undefined' && source instanceof Response ? source.body : source).getReader();
		const stop = () => { reader.cancel().catch(() => { }); };
		const frames = frameBuffer(maxFrameBytes);
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) return true;
				frames.push(value);
				for (let f; (f = frames.take());) {
					if (onFrame(await openFrame(f)) === false) {
						stop();
						return false;
					}
				}
				if (frames.tooLong) {
					stop();
					return false;
				}
			}
		} finally {
			reader.releaseLock();
		}
	};

	// ======== protobuf decoding (bard API) ========

	// decodeBard(typeName, bytes): decode a bard API message (claude.ai's merged experience,
	// anthropic.bard.api.v1alpha) into a plain object shaped like protobuf-es's
	// toJson(..., { useProtoFieldName: true }), the format scripts/bard/decode-capture.mjs prints:
	// - proto field names; unset fields, and zero/empty fields without explicit presence, are left out;
	//   oneof members appear as plain fields;
	// - enums as value names (an unknown value as its number); 64-bit integers as decimal strings;
	//   bytes as base64; NaN/±Infinity floats as strings;
	// - Timestamp as RFC 3339, Duration as "1.5s", Struct/Value/ListValue as plain JSON, wrappers as
	//   their bare value, FieldMask as comma-joined camelCase paths, Any as { "@type", ...fields }
	//   (a well-known type's JSON goes in "value"; a type the table lacks keeps its bytes as base64
	//   "value").
	// typeName is a full name or one relative to anthropic.bard.api.v1alpha ('StreamEvent'). The schema
	// is net/bard-schema.js (globalThis.ClaudeExtBardSchema), looked up at call time; throws if it isn't
	// loaded, the type is unknown, or the bytes are malformed.
	//
	// { keepUnknown: true } makes the result lossless for encodeBard: every ordinary message object
	// (not the well-known types) gets "$unknown", the base64 of the raw records (tag and value, in wire
	// order) that the schema doesn't know, when there are any. So a field the server added after our
	// schema snapshot survives a decode -> edit -> encodeBard round trip.
	net.decodeBard = function (typeName, bytes, { keepUnknown = false } = {}) {
		const schema = bardSchema();
		const index = messageIndex(schema, typeName, 'decodeBard');
		return readMessage(schema, index, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { keepUnknown });
	};

	function messageIndex(schema, typeName, caller) {
		const index = schema.byName.get(typeName) ?? schema.byName.get(schema.prefix + typeName);
		if (index === undefined || schema.types[index][1] !== 'm') throw new Error(`${caller}: unknown message type ${typeName}`);
		return index;
	}

	// Name -> index (and per-type field maps), rebuilt whenever a newer schema copy replaced the table.
	let schemaCache = null;
	function bardSchema() {
		const table = globalThis.ClaudeExtBardSchema;
		if (!table) throw new Error('net.js: net/bard-schema.js is not loaded');
		if (schemaCache?.table !== table) {
			const names = table.types.map(t => (t[0][0] === '.' ? table.prefix + t[0].slice(1) : t[0]));
			schemaCache = {
				table,
				types: table.types,
				prefix: table.prefix,
				names,
				byName: new Map(names.map((n, i) => [n, i])),
				fieldMaps: new Map(),
				fieldsByName: new Map(),
				fieldsInOrder: new Map(),
				enumNumbers: new Map(),
			};
		}
		return schemaCache;
	}

	// ScalarType numbers (descriptor.proto's FieldDescriptorProto.Type).
	const T = { DOUBLE: 1, FLOAT: 2, INT64: 3, UINT64: 4, INT32: 5, FIXED64: 6, FIXED32: 7, BOOL: 8, STRING: 9, BYTES: 12, UINT32: 13, SFIXED32: 15, SFIXED64: 16, SINT32: 17, SINT64: 18 };
	const INT64_TYPES = [T.INT64, T.UINT64, T.SINT64, T.FIXED64, T.SFIXED64];
	const utf8 = new TextDecoder();

	function scalarZero(type) {
		if (type === T.STRING) return '';
		if (type === T.BOOL) return false;
		if (type === T.BYTES) return new Uint8Array(0);
		return INT64_TYPES.includes(type) ? '0' : 0;
	}

	// A cursor over protobuf wire bytes.
	function cursor(bytes) {
		return { bytes, pos: 0, end: bytes.length, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
	}

	function need(c, n) {
		if (c.pos + n > c.end) throw new Error('decodeBard: truncated message');
	}

	// A varint as [lo, hi] unsigned 32-bit halves.
	function varint64(c) {
		let lo = 0, hi = 0, shift = 0, b;
		do {
			need(c, 1);
			b = c.bytes[c.pos++];
			if (shift < 28) lo |= (b & 0x7f) << shift;
			else if (shift === 28) {
				lo |= (b & 0x0f) << 28;
				hi |= (b & 0x7f) >> 4;
			} else hi |= (b & 0x7f) << (shift - 32);
			shift += 7;
		} while (b & 0x80 && shift < 70);
		return [lo >>> 0, hi >>> 0];
	}
	const varint32 = (c) => varint64(c)[0];
	const u64 = (lo, hi) => (BigInt(hi) << 32n) | BigInt(lo);

	function lengthDelimited(c) {
		const len = varint32(c);
		need(c, len);
		const out = c.bytes.subarray(c.pos, c.pos + len);
		c.pos += len;
		return out;
	}

	function readScalar(c, type) {
		switch (type) {
			case T.INT32: return varint32(c) | 0;
			case T.UINT32: return varint32(c);
			case T.SINT32: { const n = varint32(c); return (n >>> 1) ^ -(n & 1); }
			case T.BOOL: { const [lo, hi] = varint64(c); return lo !== 0 || hi !== 0; }
			case T.INT64: { const [lo, hi] = varint64(c); return BigInt.asIntN(64, u64(lo, hi)).toString(); }
			case T.UINT64: { const [lo, hi] = varint64(c); return u64(lo, hi).toString(); }
			case T.SINT64: { const [lo, hi] = varint64(c); const n = u64(lo, hi); return ((n >> 1n) ^ -(n & 1n)).toString(); }
			case T.STRING: return utf8.decode(lengthDelimited(c));
			case T.BYTES: return lengthDelimited(c);
		}
		const size = type === T.DOUBLE || type === T.FIXED64 || type === T.SFIXED64 ? 8 : 4;
		need(c, size);
		const at = c.pos;
		c.pos += size;
		switch (type) {
			case T.FIXED32: return c.view.getUint32(at, true);
			case T.SFIXED32: return c.view.getInt32(at, true);
			case T.FLOAT: return c.view.getFloat32(at, true);
			case T.FIXED64: return c.view.getBigUint64(at, true).toString();
			case T.SFIXED64: return c.view.getBigInt64(at, true).toString();
			case T.DOUBLE: return c.view.getFloat64(at, true);
		}
		throw new Error(`decodeBard: unsupported scalar type ${type}`);
	}

	function skipField(c, wireType) {
		switch (wireType) {
			case 0: varint64(c); return;
			case 1: need(c, 8); c.pos += 8; return;
			case 2: lengthDelimited(c); return;
			case 5: need(c, 4); c.pos += 4; return;
			case 3: // a group: skip to its end tag
				for (;;) {
					const tag = varint32(c);
					if ((tag & 7) === 4) return;
					skipField(c, tag & 7);
				}
		}
		throw new Error(`decodeBard: bad wire type ${wireType}`);
	}

	function fieldMap(schema, typeIndex) {
		let map = schema.fieldMaps.get(typeIndex);
		if (!map) {
			map = new Map(schema.types[typeIndex][2].map(f => [f[0], f]));
			schema.fieldMaps.set(typeIndex, map);
		}
		return map;
	}

	// Raw field values, before JSON conversion: Map(field entry -> value). Scalars as JS values (bytes
	// as Uint8Array, 64-bit as strings), enums as numbers. Message values are arrays of byte slices: a
	// singular message seen twice is merged by decoding the concatenation (protobuf's merge semantics);
	// for repeated messages and map entries each element is its own one-slice array. Records of fields
	// the schema doesn't know are skipped, or pushed (tag and value, as byte slices) onto `unknown`.
	function readRaw(schema, typeIndex, bytes, unknown = null) {
		const byNumber = fieldMap(schema, typeIndex);
		const values = new Map();
		const oneofCase = new Map();
		const list = (f) => {
			let l = values.get(f);
			if (!l) values.set(f, (l = []));
			return l;
		};
		const c = cursor(bytes);
		while (c.pos < c.end) {
			const start = c.pos;
			const tag = varint32(c);
			const f = byNumber.get(tag >>> 3);
			if (!f) {
				skipField(c, tag & 7);
				unknown?.push(c.bytes.subarray(start, c.pos));
				continue;
			}
			const [, , kind, ref, flags, oneof] = f;
			const repeated = flags & 1;
			if (oneof !== undefined) {
				const previous = oneofCase.get(oneof);
				if (previous && previous !== f) values.delete(previous);
				oneofCase.set(oneof, f);
			}
			if (kind === 'm' || kind === 'M') {
				const slice = lengthDelimited(c);
				if (repeated || kind === 'M') list(f).push([slice]);
				else list(f).push(slice);
				continue;
			}
			const type = kind === 'e' ? T.INT32 : ref;
			// Numeric repeated fields may come packed (one length-delimited run) or one value per tag.
			if (repeated && (tag & 7) === 2 && type !== T.STRING && type !== T.BYTES) {
				const run = cursor(lengthDelimited(c));
				const l = list(f);
				while (run.pos < run.end) l.push(readScalar(run, type));
				continue;
			}
			const value = readScalar(c, type);
			if (repeated) list(f).push(value);
			else values.set(f, value);
		}
		return values;
	}

	// Map and Struct keys are data: a plain assignment of '__proto__' would hit the prototype setter
	// (dropping the entry, or replacing the object's prototype) instead of adding a property.
	function setOwn(obj, key, value) {
		Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
	}

	function concat(slices) {
		if (slices.length === 1) return slices[0];
		const out = new Uint8Array(slices.reduce((n, s) => n + s.length, 0));
		let at = 0;
		for (const s of slices) {
			out.set(s, at);
			at += s.length;
		}
		return out;
	}

	function base64(bytes) {
		let s = '';
		for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
		return btoa(s);
	}

	function enumJson(schema, enumIndex, number) {
		if (schema.names[enumIndex] === 'google.protobuf.NullValue') return null;
		return schema.types[enumIndex][2][number] ?? number;
	}

	function scalarJson(type, value) {
		if (type === T.BYTES) return base64(value);
		if (type === T.FLOAT || type === T.DOUBLE) {
			if (Number.isNaN(value)) return 'NaN';
			if (value === Infinity) return 'Infinity';
			if (value === -Infinity) return '-Infinity';
		}
		return value;
	}

	function isZero(schema, kind, ref, value) {
		if (kind === 'e') return value === schema.types[ref][3];
		if (ref === T.BYTES) return value.length === 0;
		if (ref === T.FLOAT || ref === T.DOUBLE) return Object.is(value, 0);
		return value === scalarZero(ref);
	}

	function valueJson(schema, kind, ref, value, opts) {
		if (kind === 'e') return enumJson(schema, ref, value);
		if (kind === 'm') return readMessage(schema, ref, concat(value), opts);
		return scalarJson(ref, value);
	}

	// opts: { keepUnknown } (see decodeBard). Undefined for the well-known types' internals.
	function readMessage(schema, typeIndex, bytes, opts) {
		const name = schema.names[typeIndex];
		if (name.startsWith('google.protobuf.')) {
			const wkt = readWkt(schema, typeIndex, name, bytes, opts);
			if (wkt !== undefined) return wkt.json;
		}
		const unknown = opts?.keepUnknown ? [] : null;
		const values = readRaw(schema, typeIndex, bytes, unknown);
		const json = {};
		for (const f of schema.types[typeIndex][2]) {
			if (!values.has(f)) continue;
			const [, fieldName, kind, ref, flags] = f;
			const value = values.get(f);
			if (kind === 'M') {
				const map = {};
				for (const [slice] of value) {
					const entry = readMapEntry(schema, ref, slice, opts);
					setOwn(map, entry.key, entry.value);
				}
				json[fieldName] = map;
			} else if (flags & 1) {
				json[fieldName] = value.map(v => valueJson(schema, kind, ref, v, opts));
			} else if (kind === 'm' || flags & 2 || !isZero(schema, kind, ref, value)) {
				json[fieldName] = valueJson(schema, kind, ref, value, opts);
			}
		}
		if (unknown?.length) json.$unknown = base64(concat(unknown));
		return json;
	}

	// A map entry: key = 1, value = 2; a missing one takes its zero value.
	function readMapEntry(schema, [keyType, valueKind, valueRef], bytes, opts) {
		const c = cursor(bytes);
		let key = scalarZero(keyType), value, slices = [];
		while (c.pos < c.end) {
			const tag = varint32(c);
			if (tag >>> 3 === 1) key = readScalar(c, keyType);
			else if (tag >>> 3 === 2 && valueKind === 'm') slices.push(lengthDelimited(c));
			else if (tag >>> 3 === 2) value = readScalar(c, valueKind === 'e' ? T.INT32 : valueRef);
			else skipField(c, tag & 7);
		}
		let json;
		if (valueKind === 'm') json = readMessage(schema, valueRef, concat(slices.length ? slices : [new Uint8Array(0)]), opts);
		else if (valueKind === 'e') json = enumJson(schema, valueRef, value ?? 0);
		else json = scalarJson(valueRef, value ?? scalarZero(valueRef));
		return { key: String(key), value: json };
	}

	const WRAPPERS = {
		'google.protobuf.DoubleValue': T.DOUBLE,
		'google.protobuf.FloatValue': T.FLOAT,
		'google.protobuf.Int64Value': T.INT64,
		'google.protobuf.UInt64Value': T.UINT64,
		'google.protobuf.Int32Value': T.INT32,
		'google.protobuf.UInt32Value': T.UINT32,
		'google.protobuf.BoolValue': T.BOOL,
		'google.protobuf.StringValue': T.STRING,
		'google.protobuf.BytesValue': T.BYTES,
	};
	const CUSTOM_JSON = new Set([
		'google.protobuf.Any', 'google.protobuf.Timestamp', 'google.protobuf.Duration', 'google.protobuf.FieldMask',
		'google.protobuf.Struct', 'google.protobuf.Value', 'google.protobuf.ListValue', ...Object.keys(WRAPPERS),
	]);

	// Fractional seconds the way protobuf JSON writes them: 3, 6 or 9 digits.
	function nanosText(nanos) {
		const n = String(nanos).padStart(9, '0');
		return n.slice(3) === '000000' ? n.slice(0, 3) : n.slice(6) === '000' ? n.slice(0, 6) : n;
	}

	// Well-known types with their own JSON form: { json }, or undefined for a plain message.
	function readWkt(schema, typeIndex, name, bytes, opts) {
		if (!CUSTOM_JSON.has(name)) return undefined;
		const fields = {};
		for (const [f, v] of readRaw(schema, typeIndex, bytes)) fields[f[1]] = v;
		if (name in WRAPPERS) return { json: scalarJson(WRAPPERS[name], fields.value ?? scalarZero(WRAPPERS[name])) };
		switch (name) {
			case 'google.protobuf.Timestamp': {
				const { seconds = '0', nanos = 0 } = fields;
				const z = nanos > 0 ? '.' + nanosText(nanos) + 'Z' : 'Z';
				return { json: new Date(Number(seconds) * 1000).toISOString().replace('.000Z', z) };
			}
			case 'google.protobuf.Duration': {
				const { seconds = '0', nanos = 0 } = fields;
				let text = String(seconds);
				if (nanos !== 0) {
					text += '.' + nanosText(Math.abs(nanos));
					if (nanos < 0 && Number(seconds) === 0) text = '-' + text;
				}
				return { json: text + 's' };
			}
			case 'google.protobuf.FieldMask':
				return { json: (fields.paths ?? []).map(p => p.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase())).join(',') };
			case 'google.protobuf.Struct': {
				const json = {};
				for (const [slice] of fields.fields ?? []) {
					const entry = readMapEntry(schema, [T.STRING, 'm', typeIndexOf(schema, 'google.protobuf.Value')], slice);
					setOwn(json, entry.key, entry.value);
				}
				return { json };
			}
			case 'google.protobuf.ListValue':
				return { json: (fields.values ?? []).map(slices => readMessage(schema, typeIndexOf(schema, 'google.protobuf.Value'), concat(slices))) };
			case 'google.protobuf.Value': {
				if ('null_value' in fields) return { json: null };
				if ('number_value' in fields) return { json: fields.number_value };
				if ('string_value' in fields) return { json: fields.string_value };
				if ('bool_value' in fields) return { json: fields.bool_value };
				if ('struct_value' in fields) return { json: readMessage(schema, typeIndexOf(schema, 'google.protobuf.Struct'), concat(fields.struct_value)) };
				if ('list_value' in fields) return { json: readMessage(schema, typeIndexOf(schema, 'google.protobuf.ListValue'), concat(fields.list_value)) };
				throw new Error('decodeBard: google.protobuf.Value must have a value');
			}
			case 'google.protobuf.Any': {
				const typeUrl = fields.type_url ?? '';
				if (!typeUrl) return { json: {} };
				const value = fields.value ?? new Uint8Array(0);
				const inner = schema.byName.get(typeUrl.slice(typeUrl.lastIndexOf('/') + 1));
				if (inner === undefined || schema.types[inner][1] !== 'm') return { json: { '@type': typeUrl, value: base64(value) } };
				const decoded = readMessage(schema, inner, value, opts);
				const json = CUSTOM_JSON.has(schema.names[inner]) ? { value: decoded } : decoded;
				json['@type'] = typeUrl;
				return { json };
			}
		}
		return undefined;
	}

	function typeIndexOf(schema, name) {
		const index = schema.byName.get(name);
		if (index === undefined) throw new Error(`net.js: ${name} missing from the schema`);
		return index;
	}

	// ======== protobuf encoding (bard API) ========

	// encodeBard(typeName, obj): the inverse of decodeBard. obj has decodeBard's shape (proto field
	// names, enum names, 64-bit integers as decimal strings, bytes as base64, the well-known types'
	// JSON forms); a decodeBard(..., { keepUnknown: true }) result encodes back losslessly, its
	// "$unknown" records appended verbatim. To build a message from scratch, also accepted: enums by
	// number, 64-bit integers as numbers or bigints, bytes as Uint8Array.
	// Strict, so a typo fails loudly: a property the type doesn't have throws, so does setting two
	// members of one oneof. "$unknown" records are written first, then the fields in field-number
	// order: an explicitly set field beats retained data in the same oneof (a member the server added
	// that our schema lacks). The flip side: bytes carrying two members of one oneof, a known one
	// before an unknown one (only possible by concatenating messages; a serializer writes at most one),
	// resolve to the known member after a round trip, not the later one. Implicit-presence zero values
	// are left out; explicit-presence fields and message fields are written whenever present (so
	// parent_message_id: '' and {} are kept). null leaves a field unset (except google.protobuf.Value).
	// Returns a Uint8Array. Appending encodeBard(type, partial) to a message's bytes merges into it
	// (protobuf: a later singular value wins, repeated ones are added).
	net.encodeBard = function (typeName, obj) {
		const schema = bardSchema();
		const w = writer();
		writeMessage(schema, messageIndex(schema, typeName, 'encodeBard'), obj ?? {}, w);
		return w.finish();
	};

	const utf8Encoder = new TextEncoder();

	// A growable byte buffer.
	function writer() {
		let buf = new Uint8Array(256), pos = 0;
		const view = () => new DataView(buf.buffer);
		const ensure = (n) => {
			if (pos + n <= buf.length) return;
			let size = buf.length * 2;
			while (size < pos + n) size *= 2;
			const next = new Uint8Array(size);
			next.set(buf.subarray(0, pos));
			buf = next;
		};
		const w = {
			bytes(b) { ensure(b.length); buf.set(b, pos); pos += b.length; },
			uint32(n) { // varint of an unsigned 32-bit value
				ensure(5);
				n >>>= 0;
				while (n > 0x7f) { buf[pos++] = (n & 0x7f) | 0x80; n >>>= 7; }
				buf[pos++] = n;
			},
			uint64(big) { // varint of a 64-bit value (negative ones as two's complement: 10 bytes)
				ensure(10);
				let n = BigInt.asUintN(64, big);
				while (n > 0x7fn) { buf[pos++] = Number(n & 0x7fn) | 0x80; n >>= 7n; }
				buf[pos++] = Number(n);
			},
			fixed32(n, signed) { ensure(4); view()[signed ? 'setInt32' : 'setUint32'](pos, n, true); pos += 4; },
			fixed64(big, signed) { ensure(8); view()[signed ? 'setBigInt64' : 'setBigUint64'](pos, signed ? BigInt.asIntN(64, big) : BigInt.asUintN(64, big), true); pos += 8; },
			float(n) { ensure(4); view().setFloat32(pos, n, true); pos += 4; },
			double(n) { ensure(8); view().setFloat64(pos, n, true); pos += 8; },
			tag(no, wireType) { w.uint32(((no << 3) | wireType) >>> 0); },
			delimited(b) { w.uint32(b.length); w.bytes(b); },
			finish() { return buf.slice(0, pos); },
		};
		return w;
	}

	function fail(msg) {
		throw new Error(`encodeBard: ${msg}`);
	}

	function wireTypeOf(type) {
		if (type === T.DOUBLE || type === T.FIXED64 || type === T.SFIXED64) return 1;
		if (type === T.FLOAT || type === T.FIXED32 || type === T.SFIXED32) return 5;
		if (type === T.STRING || type === T.BYTES) return 2;
		return 0;
	}

	function toBigInt(value, what) {
		if (typeof value === 'bigint') return value;
		if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
		if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
		fail(`${what}: ${JSON.stringify(String(value))} is not an integer`);
	}

	function toInt(value, what) {
		const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
		if (typeof n !== 'number' || !Number.isInteger(n)) fail(`${what}: ${JSON.stringify(String(value))} is not an integer`);
		return n;
	}

	function toFloat(value, what) {
		if (value === 'NaN') return NaN;
		if (value === 'Infinity') return Infinity;
		if (value === '-Infinity') return -Infinity;
		const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
		if (typeof n !== 'number' || (Number.isNaN(n) && typeof value !== 'number')) fail(`${what}: ${JSON.stringify(String(value))} is not a number`);
		return n;
	}

	function toBytes(value, what) {
		if (value instanceof Uint8Array) return value;
		if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		if (typeof value !== 'string') fail(`${what}: expected base64 or a Uint8Array`);
		const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}

	function enumNumber(schema, enumIndex, value, what) {
		if (value === null && schema.names[enumIndex] === 'google.protobuf.NullValue') return 0;
		if (typeof value === 'number' && Number.isInteger(value)) return value;
		let numbers = schema.enumNumbers.get(enumIndex);
		if (!numbers) {
			numbers = new Map(Object.entries(schema.types[enumIndex][2]).map(([n, name]) => [name, Number(n)]));
			schema.enumNumbers.set(enumIndex, numbers);
		}
		const n = numbers.get(value);
		if (n === undefined) fail(`${what}: ${JSON.stringify(value)} is not a value of ${schema.names[enumIndex]}`);
		return n;
	}

	// One scalar value, without its tag.
	function writeScalar(w, type, value, what) {
		switch (type) {
			case T.STRING:
				if (typeof value !== 'string') fail(`${what}: expected a string`);
				return w.delimited(utf8Encoder.encode(value));
			case T.BYTES: return w.delimited(toBytes(value, what));
			case T.BOOL:
				if (typeof value !== 'boolean') fail(`${what}: expected a boolean`);
				return w.uint32(value ? 1 : 0);
			case T.INT32: { const n = toInt(value, what); return n < 0 ? w.uint64(BigInt(n)) : w.uint32(n); }
			case T.UINT32: return w.uint32(toInt(value, what));
			case T.SINT32: { const n = toInt(value, what); return w.uint32((n << 1) ^ (n >> 31)); }
			case T.INT64: case T.UINT64: return w.uint64(toBigInt(value, what));
			case T.SINT64: { const n = BigInt.asIntN(64, toBigInt(value, what)); return w.uint64((n << 1n) ^ (n >> 63n)); }
			case T.FIXED32: return w.fixed32(toInt(value, what), false);
			case T.SFIXED32: return w.fixed32(toInt(value, what), true);
			case T.FIXED64: return w.fixed64(toBigInt(value, what), false);
			case T.SFIXED64: return w.fixed64(toBigInt(value, what), true);
			case T.FLOAT: return w.float(toFloat(value, what));
			case T.DOUBLE: return w.double(toFloat(value, what));
		}
		fail(`${what}: unsupported scalar type ${type}`);
	}

	// Whether a scalar/enum input is its type's zero value (left out without explicit presence).
	function isZeroInput(schema, kind, ref, value) {
		if (kind === 'e') return value === schema.types[ref][3] || value === schema.types[ref][2][schema.types[ref][3]];
		switch (ref) {
			case T.STRING: return value === '';
			case T.BYTES: return toBytes(value, '').length === 0;
			case T.BOOL: return value === false;
			case T.FLOAT: case T.DOUBLE: return Object.is(toFloat(value, ''), 0);
		}
		return INT64_TYPES.includes(ref) ? toBigInt(value, '') === 0n : toInt(value, '') === 0;
	}

	function fieldsByName(schema, typeIndex) {
		let map = schema.fieldsByName.get(typeIndex);
		if (!map) schema.fieldsByName.set(typeIndex, (map = new Map(schema.types[typeIndex][2].map(f => [f[1], f]))));
		return map;
	}

	function fieldsInOrder(schema, typeIndex) {
		let list = schema.fieldsInOrder.get(typeIndex);
		if (!list) schema.fieldsInOrder.set(typeIndex, (list = [...schema.types[typeIndex][2]].sort((a, b) => a[0] - b[0])));
		return list;
	}

	// A nested message's bytes (for a length-delimited field).
	function messageBytes(schema, typeIndex, value) {
		const w = writer();
		writeMessage(schema, typeIndex, value, w);
		return w.finish();
	}

	function writeMessage(schema, typeIndex, obj, w) {
		const name = schema.names[typeIndex];
		if (CUSTOM_JSON.has(name)) return writeWkt(schema, typeIndex, name, obj, w);
		if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) fail(`${name}: expected an object`);
		const byName = fieldsByName(schema, typeIndex);
		const oneofSet = new Map();
		for (const key of Object.keys(obj)) {
			if (key === '$unknown') continue;
			const f = byName.get(key);
			if (!f) fail(`${name} has no field ${key}`);
			if (f[5] !== undefined && obj[key] !== undefined && obj[key] !== null) {
				if (oneofSet.has(f[5])) fail(`${name}: ${oneofSet.get(f[5])} and ${key} are members of the same oneof`);
				oneofSet.set(f[5], key);
			}
		}
		// Retained unknown records go first: they can only clash with known fields through a oneof
		// (the server added a member we don't know), and protobuf's last-wins then lets the caller's
		// explicit fields win, instead of the retained data silently undoing an edit.
		if (obj.$unknown) w.bytes(toBytes(obj.$unknown, `${name}.$unknown`));
		for (const f of fieldsInOrder(schema, typeIndex)) {
			const [no, fieldName, kind, ref, flags] = f;
			const value = obj[fieldName];
			if (value === undefined) continue;
			const what = `${name}.${fieldName}`;
			if (value === null) {
				if (kind === 'm' && !(flags & 1) && schema.names[ref] === 'google.protobuf.Value') {
					w.tag(no, 2);
					w.delimited(messageBytes(schema, ref, null));
				}
				continue;
			}
			if (kind === 'M') {
				if (typeof value !== 'object' || Array.isArray(value)) fail(`${what}: expected an object (map)`);
				for (const [key, entryValue] of Object.entries(value)) {
					w.tag(no, 2);
					w.delimited(mapEntryBytes(schema, ref, key, entryValue, what));
				}
			} else if (flags & 1) {
				if (!Array.isArray(value)) fail(`${what}: expected an array`);
				if (kind === 'm') {
					for (const item of value) {
						w.tag(no, 2);
						w.delimited(messageBytes(schema, ref, item));
					}
				} else if (kind === 's' && (ref === T.STRING || ref === T.BYTES)) {
					for (const item of value) {
						w.tag(no, 2);
						writeScalar(w, ref, item, what);
					}
				} else if (value.length) { // packed
					const run = writer();
					for (const item of value) {
						if (kind === 'e') run.uint64(BigInt(enumNumber(schema, ref, item, what)));
						else writeScalar(run, ref, item, what);
					}
					w.tag(no, 2);
					w.delimited(run.finish());
				}
			} else if (kind === 'm') {
				w.tag(no, 2);
				w.delimited(messageBytes(schema, ref, value));
			} else if (flags & 2 || !isZeroInput(schema, kind, ref, value)) {
				if (kind === 'e') {
					w.tag(no, 0);
					w.uint64(BigInt(enumNumber(schema, ref, value, what)));
				} else {
					w.tag(no, wireTypeOf(ref));
					writeScalar(w, ref, value, what);
				}
			}
		}
	}

	// A map entry (key = 1, value = 2) for a decodeBard-shaped key (always a string) and value.
	function mapEntryBytes(schema, [keyType, valueKind, valueRef], key, value, what) {
		const w = writer();
		w.tag(1, wireTypeOf(keyType));
		if (keyType === T.STRING) writeScalar(w, keyType, key, what);
		else if (keyType === T.BOOL) writeScalar(w, keyType, key === 'true' || key === true, what);
		else writeScalar(w, keyType, key, what);
		if (valueKind === 'm') {
			w.tag(2, 2);
			w.delimited(messageBytes(schema, valueRef, value ?? {}));
		} else if (valueKind === 'e') {
			w.tag(2, 0);
			w.uint64(BigInt(enumNumber(schema, valueRef, value, what)));
		} else {
			w.tag(2, wireTypeOf(valueRef));
			writeScalar(w, valueRef, value, what);
		}
		return w.finish();
	}

	const fieldNo = (schema, typeIndex, fieldName) => fieldsByName(schema, typeIndex).get(fieldName)[0];

	// "1970-01-01T00:00:00.123456789Z" (or with a +hh:mm offset) -> [seconds, nanos]. By hand:
	// Date keeps milliseconds only.
	function parseTimestamp(text, what) {
		if (text instanceof Date) {
			const ms = text.getTime();
			return [BigInt(Math.floor(ms / 1000)), (((ms % 1000) + 1000) % 1000) * 1e6];
		}
		const m = /^([+-]?\d{4,6})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|[+-]\d{2}:\d{2})$/.exec(String(text));
		if (!m) fail(`${what}: ${JSON.stringify(String(text))} is not an RFC 3339 timestamp`);
		const date = new Date(Date.UTC(2000, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
		date.setUTCFullYear(Number(m[1]));
		let seconds = BigInt(date.getTime() / 1000);
		if (m[8].length === 6) {
			const sign = m[8][0] === '-' ? -1n : 1n;
			seconds -= sign * (BigInt(m[8].slice(1, 3)) * 3600n + BigInt(m[8].slice(4, 6)) * 60n);
		}
		return [seconds, Number((m[7] ?? '').padEnd(9, '0'))];
	}

	// "1.5s" / "-0.5s" -> [seconds, nanos], both carrying the sign.
	function parseDuration(text, what) {
		const m = /^(-)?(\d+)(?:\.(\d{1,9}))?s$/.exec(String(text));
		if (!m) fail(`${what}: ${JSON.stringify(String(text))} is not a duration`);
		const sign = m[1] ? -1 : 1;
		return [BigInt(m[2]) * BigInt(sign), sign * Number((m[3] ?? '').padEnd(9, '0'))];
	}

	function writeSecondsNanos(schema, typeIndex, [seconds, nanos], w) {
		if (seconds !== 0n) {
			w.tag(fieldNo(schema, typeIndex, 'seconds'), 0);
			w.uint64(seconds);
		}
		if (nanos !== 0) {
			w.tag(fieldNo(schema, typeIndex, 'nanos'), 0);
			writeScalar(w, T.INT32, nanos, 'nanos');
		}
	}

	// The well-known types with their own JSON forms (CUSTOM_JSON), from those forms.
	function writeWkt(schema, typeIndex, name, value, w) {
		if (name in WRAPPERS) {
			const type = WRAPPERS[name];
			if (value !== null && !isZeroInput(schema, 's', type, value)) {
				w.tag(fieldNo(schema, typeIndex, 'value'), wireTypeOf(type));
				writeScalar(w, type, value, name);
			}
			return;
		}
		switch (name) {
			case 'google.protobuf.Timestamp': return writeSecondsNanos(schema, typeIndex, parseTimestamp(value, name), w);
			case 'google.protobuf.Duration': return writeSecondsNanos(schema, typeIndex, parseDuration(value, name), w);
			case 'google.protobuf.FieldMask': {
				const no = fieldNo(schema, typeIndex, 'paths');
				for (const path of String(value ?? '').split(',').filter(Boolean)) {
					w.tag(no, 2);
					writeScalar(w, T.STRING, path.replace(/[A-Z]/g, ch => '_' + ch.toLowerCase()), name);
				}
				return;
			}
			case 'google.protobuf.Struct': {
				if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${name}: expected an object`);
				const no = fieldNo(schema, typeIndex, 'fields');
				const valueIndex = typeIndexOf(schema, 'google.protobuf.Value');
				for (const [key, v] of Object.entries(value)) {
					w.tag(no, 2);
					w.delimited(mapEntryBytes(schema, [T.STRING, 'm', valueIndex], key, v, name));
				}
				return;
			}
			case 'google.protobuf.ListValue': {
				if (!Array.isArray(value)) fail(`${name}: expected an array`);
				const no = fieldNo(schema, typeIndex, 'values');
				const valueIndex = typeIndexOf(schema, 'google.protobuf.Value');
				for (const v of value) {
					w.tag(no, 2);
					w.delimited(messageBytes(schema, valueIndex, v));
				}
				return;
			}
			case 'google.protobuf.Value': {
				const no = (field) => fieldNo(schema, typeIndex, field);
				if (value === null || value === undefined) { w.tag(no('null_value'), 0); w.uint32(0); }
				else if (typeof value === 'number') { w.tag(no('number_value'), 1); w.double(value); }
				else if (typeof value === 'string') { w.tag(no('string_value'), 2); writeScalar(w, T.STRING, value, name); }
				else if (typeof value === 'boolean') { w.tag(no('bool_value'), 0); w.uint32(value ? 1 : 0); }
				else if (Array.isArray(value)) { w.tag(no('list_value'), 2); w.delimited(messageBytes(schema, typeIndexOf(schema, 'google.protobuf.ListValue'), value)); }
				else if (typeof value === 'object') { w.tag(no('struct_value'), 2); w.delimited(messageBytes(schema, typeIndexOf(schema, 'google.protobuf.Struct'), value)); }
				else fail(`${name}: unsupported value ${String(value)}`);
				return;
			}
			case 'google.protobuf.Any': {
				if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${name}: expected an object`);
				const typeUrl = value['@type'] ?? '';
				if (!typeUrl) {
					if (Object.keys(value).length) fail(`${name}: "@type" missing`);
					return;
				}
				const inner = schema.byName.get(typeUrl.slice(typeUrl.lastIndexOf('/') + 1));
				let bytes;
				if (inner === undefined || schema.types[inner][1] !== 'm') {
					bytes = toBytes(value.value ?? '', `${name}.value`);
				} else if (CUSTOM_JSON.has(schema.names[inner])) {
					bytes = messageBytes(schema, inner, value.value);
				} else {
					const rest = { ...value };
					delete rest['@type'];
					bytes = messageBytes(schema, inner, rest);
				}
				w.tag(fieldNo(schema, typeIndex, 'type_url'), 2);
				writeScalar(w, T.STRING, typeUrl, name);
				if (bytes.length) {
					w.tag(fieldNo(schema, typeIndex, 'value'), 2);
					w.delimited(bytes);
				}
				return;
			}
		}
		fail(`${name}: no JSON form`);
	}

	// ======== Connect frames: writing and rewriting ========

	// One Connect frame around payload: flags(1) + length(4, big-endian) + payload. Never gzipped
	// (claude.ai's client accepts plain frames whatever the stream negotiated). endStream marks the
	// end-of-stream frame, whose payload is JSON trailers.
	net.encodeConnectFrame = function (payload, { endStream = false } = {}) {
		const frame = new Uint8Array(5 + payload.length);
		frame[0] = endStream ? FRAME_END : 0;
		new DataView(frame.buffer).setUint32(1, payload.length);
		frame.set(payload, 5);
		return frame;
	};

	// Rewrite a Connect streaming body (a Response or a ReadableStream) frame by frame. Returns
	// { stream, inject }: `stream` is the rewritten body. For every incoming frame, in order,
	// onFrame({ endStream, payload, trailers, raw }) is awaited (payload gunzipped, raw = the frame's
	// original bytes) and returns:
	// - undefined: forward the frame as it was (raw, byte for byte);
	// - a Uint8Array: forward that payload instead, as one plain frame (same end-of-stream flag);
	// - an array of Uint8Array payloads: forward those frames (an empty array drops the frame); for
	//   the end-of-stream frame, only the last of them is marked as the end.
	// If onFrame throws (or rejects), the original frame is forwarded and onError(error) called: a bug
	// in a patch never breaks the page's stream. inject(payload) adds a plain frame of our own, delivered
	// at the next frame boundary, even while the source is idle; it returns false (and does nothing)
	// once the stream has ended, been cancelled or errored. Cancelling `stream` cancels the source.
	net.rewriteConnectStream = function (source, onFrame, { onError } = {}) {
		const reader = (typeof Response !== 'undefined' && source instanceof Response ? source.body : source).getReader();
		const frames = frameBuffer();
		const injected = [];
		let closed = false;
		let wake = null;
		let pendingRead = null;
		// The reporter must not break fail-open either: an error it throws is swallowed.
		const report = (e) => {
			try {
				onError?.(e);
			} catch (ignored) { /* nothing left to report it to */ }
		};

		const rewrite = async (f) => {
			const original = [f.frame];
			let result;
			try {
				result = await onFrame({ ...(await openFrame(f)), raw: f.frame });
			} catch (e) {
				report(e);
				return original;
			}
			if (result === undefined || result === null) return original;
			const endStream = !!(f.flags & FRAME_END);
			if (result instanceof Uint8Array) return [net.encodeConnectFrame(result, { endStream })];
			// A stream has one end-of-stream frame: when splitting it, only the last piece is the end.
			if (Array.isArray(result) && result.every(p => p instanceof Uint8Array)) return result.map((p, i) => net.encodeConnectFrame(p, { endStream: endStream && i === result.length - 1 }));
			report(new TypeError('rewriteConnectStream: onFrame must return undefined, a Uint8Array or an array of them'));
			return original;
		};

		const stream = new ReadableStream({
			async pull(controller) {
				try {
					for (;;) {
						if (injected.length) {
							controller.enqueue(injected.shift());
							return;
						}
						const f = frames.take();
						if (f) {
							const out = await rewrite(f);
							// Our frames must not follow the end-of-stream frame: flush them first.
							if (f.flags & FRAME_END) {
								closed = true;
								out.unshift(...injected.splice(0));
							}
							for (const frame of out) controller.enqueue(frame);
							if (out.length) return;
							continue;
						}
						pendingRead ??= reader.read();
						const woken = new Promise(resolve => { wake = resolve; });
						const r = await Promise.race([pendingRead, woken]);
						if (r === undefined) continue; // inject() woke us
						pendingRead = null;
						if (r.done) {
							closed = true; // from here on inject() refuses; frames it accepted before still go out
							for (const frame of injected.splice(0)) controller.enqueue(frame);
							const rest = frames.rest(); // a truncated last frame: pass it on as it came
							if (rest.length) controller.enqueue(rest);
							controller.close();
							return;
						}
						frames.push(r.value);
					}
				} catch (e) {
					closed = true;
					controller.error(e);
				}
			},
			cancel(reason) {
				closed = true;
				wake?.();
				return reader.cancel(reason);
			},
		});

		return {
			stream,
			inject(payload) {
				if (closed) return false;
				injected.push(net.encodeConnectFrame(payload));
				wake?.();
				return true;
			},
		};
	};

	// rewriteConnectStream for a fetch Response: { response, inject }, the response a copy of the
	// original (status, headers minus the body-encoding ones) with the rewritten body.
	net.rewriteConnectResponse = function (response, onFrame, options) {
		const { stream, inject } = net.rewriteConnectStream(response, onFrame, options);
		return {
			response: new Response(stream, { status: response.status, statusText: response.statusText, headers: net.sanitizedHeaders(response) }),
			inject,
		};
	};

	// ======== unary protobuf bodies ========

	// A fetch init's protobuf body as bytes (from a Uint8Array, ArrayBuffer, typed-array view, Blob or
	// stream), gunzipped if it was gzipped (Content-Encoding, or the gzip magic: a protobuf message can't
	// start with 0x1f). Reads init.body only, not a Request object's.
	net.readProtoRequestBody = async function (init) {
		const body = init?.body;
		let bytes;
		if (body == null) bytes = new Uint8Array(0);
		else if (body instanceof Uint8Array) bytes = body;
		else if (ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
		else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
		else bytes = new Uint8Array(await new Response(body).arrayBuffer());
		if (net.isGzipRequest(init) || net.isGzipBytes(bytes)) bytes = await net.gunzipBytes(bytes);
		return bytes;
	};

	// A copy of init carrying `bytes` as a plain (not gzipped) body, without Content-Encoding and
	// Content-Length. claude.ai's RPC endpoints accept plain bodies whatever the client sent.
	net.withProtoRequestBody = function (init, bytes) {
		const headers = new Headers(init?.headers || {});
		headers.delete('content-encoding');
		headers.delete('content-length');
		return { ...init, headers, body: bytes };
	};

	// A copy of response carrying `bytes` as its body (a unary protobuf response).
	net.protoResponse = function (response, bytes) {
		return new Response(bytes, { status: response.status, statusText: response.statusText, headers: net.sanitizedHeaders(response) });
	};

	// ======== bard API requests ========

	// [url, init] for a request of our own to the bard ConversationService (claude.ai's merged
	// experience), headers as the page sends them: fetch(...net.bardRpcRequest(...)). body is a string
	// for Connect's JSON codec (needs no schema: JSON.stringify of camelCase fields), or bytes from
	// encodeBard for protobuf. The RPCs check Origin, so send it with claude.ai's: from the page, or with
	// content.fetch from a Firefox content script (its own fetch sends the extension's).
	net.bardRpcRequest = function (method, orgId, body) {
		return [`${globalThis.location?.origin ?? 'https://claude.ai'}/claudeai-rpc/anthropic.bard.api.v1alpha.ConversationService/${method}`, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'content-type': typeof body === 'string' ? 'application/json' : 'application/proto',
				'connect-protocol-version': '1',
				'x-organization-uuid': orgId,
				'anthropic-client-platform': 'web_claude_ai',
			},
			body,
		}];
	};

	// ======== misc ========

	// Whether a localStorage kill switch is set ('1'). False if storage is unavailable.
	net.isKillSwitchOn = function (key) {
		try {
			return globalThis.localStorage?.getItem(key) === '1';
		} catch (e) {
			return false;
		}
	};
})();
