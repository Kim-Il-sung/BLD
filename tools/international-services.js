/* BLD International map/routing/data-source adapters. */
(function (global) {
  const BLDInternational = {
    // OSM tile source and shared international-service / GTFS helpers.
    mapSources: { osm: { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' } }
  };
  BLDInternational.parseCsv = function (text) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
      else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(v => v !== '')) rows.push(row); row = []; field = ''; }
      else field += c;
    }
    row.push(field); if (row.some(v => v !== '')) rows.push(row);
    if (!rows.length) return [];
    const headers = rows.shift().map(v => v.replace(/^\uFEFF/, '').trim());
    return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  };
  BLDInternational.parseCsvLine = function (line) {
    const fields = []; let field = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { fields.push(field); field = ''; }
      else field += c;
    }
    fields.push(field);
    return fields;
  };
  // Read only records whose first column matches a set of IDs. This avoids
  // materializing nearly one million stop_times objects in the browser.
  BLDInternational.selectCsvRowsByFirstColumn = async function (text, wantedIds, onProgress) {
    const newline = text.indexOf('\n');
    if (newline < 0) return [];
    const headers = BLDInternational.parseCsvLine(text.slice(0, newline).replace(/^\uFEFF/, '').replace(/\r$/, ''));
    const out = []; let start = newline + 1, scanned = 0;
    while (start < text.length) {
      let end = text.indexOf('\n', start); if (end < 0) end = text.length;
      let line = text.slice(start, end); if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line) {
        const comma = line.indexOf(',');
        let first = comma < 0 ? line : line.slice(0, comma);
        if (first.length >= 2 && first[0] === '"' && first[first.length - 1] === '"') first = first.slice(1, -1).replace(/""/g, '"');
        if (wantedIds.has(first)) {
          const values = BLDInternational.parseCsvLine(line);
          const obj = {}; headers.forEach((h, i) => { obj[h] = values[i] ?? ''; }); out.push(obj);
        }
      }
      start = end + 1; scanned++;
      if (scanned % 100000 === 0) {
        if (onProgress) onProgress(scanned);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return out;
  };
  BLDInternational.buildGtfsRouteNodes = function (stopTimes, stops, shapeRows) {
    const times = [...stopTimes].sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const shapes = [...(shapeRows || [])].sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence));
    const stopMap = stops instanceof Map ? stops : new Map(stops.map(s => [s.stop_id, s]));
    const validShape = shapes.length >= 2 && shapes.every(p => Number.isFinite(Number(p.shape_pt_lon)) && Number.isFinite(Number(p.shape_pt_lat)));
    const hasNumber = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
    const stopDist = times.map(t => hasNumber(t.shape_dist_traveled) ? Number(t.shape_dist_traveled) : NaN);
    const shapeDist = shapes.map(p => hasNumber(p.shape_dist_traveled) ? Number(p.shape_dist_traveled) : NaN);
    const distanceUsable = validShape && stopDist.length > 1 && shapeDist.length > 1 && stopDist.every(Number.isFinite) && shapeDist.every(Number.isFinite)
      && stopDist.every((v, i) => i === 0 || v >= stopDist[i - 1] - 1e-7)
      && shapeDist.every((v, i) => i === 0 || v >= shapeDist[i - 1] - 1e-7)
      && shapeDist[shapeDist.length - 1] > shapeDist[0] && stopDist[stopDist.length - 1] >= stopDist[0]
      && stopDist[0] >= shapeDist[0] - 1e-5 && stopDist[stopDist.length - 1] <= shapeDist[shapeDist.length - 1] + 1e-5;
    let positions = null, shapeMeasures = null, geometryMethod = 'stations-only';
    if (validShape && distanceUsable) {
      positions = stopDist; shapeMeasures = shapeDist;
      geometryMethod = 'shape_dist_traveled';
    } else if (validShape) {
      // Fallback: project stops to the closest forward segment on the shape.
      const meanLat = shapes.reduce((sum, p) => sum + Number(p.shape_pt_lat), 0) / shapes.length;
      const cosLat = Math.cos(meanLat * Math.PI / 180);
      const xy = shapes.map(p => [Number(p.shape_pt_lon) * 111320 * cosLat, Number(p.shape_pt_lat) * 110540]);
      const cumulative = [0];
      for (let i = 1; i < xy.length; i++) cumulative[i] = cumulative[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
      const projected = []; let minSegment = 0, minT = 0;
      for (const t of times) {
        const st = stopMap.get(t.stop_id); if (!st) { projected.push(null); continue; }
        const px = Number(st.stop_lon) * 111320 * cosLat, py = Number(st.stop_lat) * 110540;
        let best = Infinity, bestDistance = minSegment ? cumulative[minSegment] + (cumulative[minSegment + 1] - cumulative[minSegment]) * minT : 0, bestSegment = minSegment, bestT = minT;
        for (let i = minSegment; i < xy.length - 1; i++) {
          const ax = xy[i][0], ay = xy[i][1], dx = xy[i + 1][0] - ax, dy = xy[i + 1][1] - ay;
          const len2 = dx * dx + dy * dy; const lowerT = i === minSegment ? minT : 0;
          const tseg = len2 ? Math.max(lowerT, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : lowerT;
          const qx = ax + tseg * dx, qy = ay + tseg * dy; const d2 = (px - qx) ** 2 + (py - qy) ** 2;
          if (d2 < best) { best = d2; bestSegment = i; bestT = tseg; bestDistance = cumulative[i] + Math.sqrt(len2) * tseg; }
        }
        minSegment = bestSegment; minT = bestT; projected.push(bestDistance);
      }
      if (projected.every(Number.isFinite)) { positions = projected; shapeMeasures = cumulative; geometryMethod = 'forward-projection-fallback'; }
    }
    const nodes = []; let waypointCount = 0;
    const pushNode = node => {
      const prev = nodes[nodes.length - 1];
      if (prev && Math.abs(prev.lng - node.lng) < 1e-9 && Math.abs(prev.lat - node.lat) < 1e-9) return;
      nodes.push(node);
    };
    for (let i = 0; i < times.length; i++) {
      const st = stopMap.get(times[i].stop_id);
      if (!st) continue;
      const lng = Number(st.stop_lon), lat = Number(st.stop_lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      pushNode({ type: 'station', name: st.stop_name || times[i].stop_id, lng, lat });
      if (!positions || i >= times.length - 1 || !shapes.length) continue;
      const from = positions[i], to = positions[i + 1];
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
      for (let j = 0; j < shapes.length; j++) {
        const d = shapeMeasures?.[j];
        if (!Number.isFinite(d) || d <= from + 1e-6 || d >= to - 1e-6) continue;
        const p = shapes[j]; const plng = Number(p.shape_pt_lon), plat = Number(p.shape_pt_lat);
        if (!Number.isFinite(plng) || !Number.isFinite(plat)) continue;
        const before = nodes[nodes.length - 1];
        if (before && Math.abs(before.lng - plng) < 1e-9 && Math.abs(before.lat - plat) < 1e-9) continue;
        nodes.push({ type: 'waypoint', name: 'GTFS 轨迹点', lng: plng, lat: plat }); waypointCount++;
      }
    }
    return { nodes, waypointCount, geometryMethod, usedShape: !!positions };
  };
  BLDInternational.decodePolyline = function (encoded) {
    let index = 0, lat = 0, lng = 0, precision = 100000, result = [];
    const read = () => { let shift = 0, value = 0, b; do { b = encoded.charCodeAt(index++) - 63; value |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); return (value & 1) ? ~(value >> 1) : (value >> 1); };
    while (index < encoded.length) { lat += read(); lng += read(); result.push({ lng: lng / precision, lat: lat / precision }); }
    return result;
  };
  // HERE Flexible Polyline v1 decoder. The format has two header varints:
  // version, then one packed header (precision + third-dimension flags).
  // The previous implementation incorrectly read these as four independent
  // header values, shifting the coordinate stream and corrupting every route.
  BLDInternational.decodeHerePolyline = function (str) {
    if (typeof str !== 'string' || !str.length) throw new Error('HERE 返回了空的 Flexible Polyline');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let pos = 0;
    const readUnsignedVarint = () => {
      let value = 0, shift = 0;
      while (pos < str.length) {
        const digit = alphabet.indexOf(str[pos++]);
        if (digit < 0) throw new Error('HERE Flexible Polyline 含有非法字符');
        value += (digit & 0x1f) * Math.pow(2, shift);
        if ((digit & 0x20) === 0) return value;
        shift += 5;
        if (shift > 50) throw new Error('HERE Flexible Polyline 数值溢出');
      }
      throw new Error('HERE Flexible Polyline 数据意外结束');
    };
    const toSigned = value => (value % 2 === 1 ? -(Math.floor(value / 2) + 1) : value / 2);
    const version = readUnsignedVarint();
    if (version !== 1) throw new Error(`不支持的 HERE Flexible Polyline 版本：${version}`);
    const packedHeader = readUnsignedVarint();
    const precision = packedHeader & 0x0f;
    const thirdDim = (packedHeader >> 4) & 0x07;
    const thirdPrecision = (packedHeader >> 7) & 0x0f;
    const factor = Math.pow(10, precision);
    const zFactor = Math.pow(10, thirdPrecision);
    let lat = 0, lng = 0, z = 0;
    const out = [];
    while (pos < str.length) {
      lat += toSigned(readUnsignedVarint());
      lng += toSigned(readUnsignedVarint());
      if (thirdDim !== 0) z += toSigned(readUnsignedVarint());
      const point = { lng: lng / factor, lat: lat / factor };
      if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat) || Math.abs(point.lng) > 180 || Math.abs(point.lat) > 90) {
        throw new Error('HERE Flexible Polyline 解码后坐标超出有效经纬度范围');
      }
      out.push(point);
    }
    if (out.length < 2) throw new Error('HERE Flexible Polyline 解码后不足两个路线点');
    return out;
  };
  // HERE Vector Tile nearest-road matcher. Unlike Routing API radiusPenalty,
  // this evaluates road geometry locally and picks the smallest perpendicular
  // distance without road-class or route-cost weighting.
  const hereRoadTileCache = new Map();
  const HERE_ROAD_TILE_ZOOM = 17;
  const HERE_ROAD_SNAP_RADIUS_METERS = 60;
  function readPbfVarint(bytes, state) {
    let value = 0, shift = 0;
    while (state.pos < bytes.length) {
      const b = bytes[state.pos++];
      value += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) return value;
      shift += 7;
      if (shift > 49) throw new Error('HERE 道路瓦片 protobuf 数值溢出');
    }
    throw new Error('HERE 道路瓦片 protobuf 数据意外结束');
  }
  function readPbfSlice(bytes, state) {
    const length = readPbfVarint(bytes, state);
    const end = state.pos + length;
    if (end > bytes.length) throw new Error('HERE 道路瓦片 protobuf 字段长度无效');
    const slice = bytes.subarray(state.pos, end);
    state.pos = end;
    return slice;
  }
  function skipPbfVarint(bytes, state) {
    while (state.pos < bytes.length) {
      const b = bytes[state.pos++];
      if ((b & 0x80) === 0) return;
    }
    throw new Error('HERE 道路瓦片 protobuf varint 数据意外结束');
  }
  function skipPbfField(bytes, state, wire) {
    if (wire === 0) skipPbfVarint(bytes, state);
    else if (wire === 1) state.pos += 8;
    else if (wire === 2) readPbfSlice(bytes, state);
    else if (wire === 5) state.pos += 4;
    else throw new Error('HERE 道路瓦片包含不支持的 protobuf 字段');
    if (state.pos > bytes.length) throw new Error('HERE 道路瓦片 protobuf 字段越界');
  }
  function parsePbfValue(bytes) {
    const state = { pos: 0 };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (state.pos < bytes.length) {
      const tag = readPbfVarint(bytes, state), field = tag >> 3, wire = tag & 7;
      if (field === 1 && wire === 2) return new TextDecoder().decode(readPbfSlice(bytes, state));
      if (field === 2 && wire === 5) { const v = view.getFloat32(state.pos, true); state.pos += 4; return v; }
      if (field === 3 && wire === 1) { const v = view.getFloat64(state.pos, true); state.pos += 8; return v; }
      if ((field === 4 || field === 5) && wire === 0) return readPbfVarint(bytes, state);
      if (field === 6 && wire === 0) { const v = readPbfVarint(bytes, state); return (v & 1) ? -((v + 1) / 2) : v / 2; }
      if (field === 7 && wire === 0) return !!readPbfVarint(bytes, state);
      skipPbfField(bytes, state, wire);
    }
    return null;
  }
  function readPackedVarints(bytes) {
    const values = [], state = { pos: 0 };
    while (state.pos < bytes.length) values.push(readPbfVarint(bytes, state));
    return values;
  }
  function decodeMvtFeature(bytes, keys, values, extent, tileX, tileY, zoom) {
    const state = { pos: 0 };
    let type = 0, tags = [], geometry = null;
    while (state.pos < bytes.length) {
      const tag = readPbfVarint(bytes, state), field = tag >> 3, wire = tag & 7;
      if (field === 2 && wire === 2) tags = readPackedVarints(readPbfSlice(bytes, state));
      else if (field === 3 && wire === 0) type = readPbfVarint(bytes, state);
      else if (field === 4 && wire === 2) geometry = readPackedVarints(readPbfSlice(bytes, state));
      else skipPbfField(bytes, state, wire);
    }
    if (type !== 2 || !geometry?.length) return null; // roads are line features
    const properties = {};
    for (let i = 0; i + 1 < tags.length; i += 2) {
      const key = keys[tags[i]], value = values[tags[i + 1]];
      if (key !== undefined) properties[key] = value;
    }
    const kind = properties.kind;
    if (!['highway', 'major_road', 'minor_road'].includes(kind)) return null;
    const isTrue = value => value === true || value === 1 || ['true', 'yes', '1'].includes(String(value).toLowerCase());
    const noAccess = [false, 0, 'false', 'no', '0'].includes(properties.public_access);
    if (isTrue(properties.private) || noAccess || isTrue(properties.under_construction)) return null;

    const n = Math.pow(2, zoom), paths = [];
    let x = 0, y = 0, pos = 0, path = [];
    const zigzag = value => (value & 1) ? -((value + 1) / 2) : value / 2;
    const toGeo = (px, py) => {
      const worldX = (tileX + px / extent) / n;
      const worldY = (tileY + py / extent) / n;
      const lng = worldX * 360 - 180;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180 / Math.PI;
      return { lng, lat };
    };
    while (pos < geometry.length) {
      const command = geometry[pos++], id = command & 7, count = command >> 3;
      if (id === 1 || id === 2) {
        for (let i = 0; i < count; i++) {
          if (pos + 1 >= geometry.length) break;
          x += zigzag(geometry[pos++]); y += zigzag(geometry[pos++]);
          if (id === 1) {
            if (path.length >= 2) paths.push(path);
            path = [];
          }
          path.push(toGeo(x, y));
        }
      } else if (id === 7) {
        // ClosePath is not expected for line features; consume it defensively.
      } else break;
    }
    if (path.length >= 2) paths.push(path);
    return paths.length ? { paths, properties } : null;
  }
  function decodeHereRoadTile(arrayBuffer, tileX, tileY, zoom) {
    const bytes = new Uint8Array(arrayBuffer), state = { pos: 0 };
    let roads = [];
    while (state.pos < bytes.length) {
      const tag = readPbfVarint(bytes, state), field = tag >> 3, wire = tag & 7;
      if (field !== 3 || wire !== 2) { skipPbfField(bytes, state, wire); continue; }
      const layerBytes = readPbfSlice(bytes, state), ls = { pos: 0 };
      let name = '', featureBytes = [], keys = [], valueBytes = [], extent = 4096;
      while (ls.pos < layerBytes.length) {
        const lt = readPbfVarint(layerBytes, ls), lf = lt >> 3, lw = lt & 7;
        if (lf === 1 && lw === 2) name = new TextDecoder().decode(readPbfSlice(layerBytes, ls));
        else if (lf === 2 && lw === 2) featureBytes.push(readPbfSlice(layerBytes, ls));
        else if (lf === 3 && lw === 2) keys.push(new TextDecoder().decode(readPbfSlice(layerBytes, ls)));
        else if (lf === 4 && lw === 2) valueBytes.push(readPbfSlice(layerBytes, ls));
        else if (lf === 5 && lw === 0) extent = readPbfVarint(layerBytes, ls);
        else skipPbfField(layerBytes, ls, lw);
      }
      if (name === 'roads') {
        const values = valueBytes.map(parsePbfValue);
        featureBytes.forEach(feature => {
          const decoded = decodeMvtFeature(feature, keys, values, extent, tileX, tileY, zoom);
          if (decoded) roads.push(decoded);
        });
      }
    }
    return roads;
  }
  function hereTileIndex(lng, lat, zoom) {
    const n = Math.pow(2, zoom), latClamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const x = Math.max(0, Math.min(n - 1, Math.floor((lng + 180) / 360 * n)));
    const rad = latClamped * Math.PI / 180;
    const y = Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n)));
    return { x, y };
  }
  async function fetchHereRoadTile(x, y, zoom, key) {
    const cacheKey = `${zoom}/${x}/${y}`;
    if (hereRoadTileCache.has(cacheKey)) return hereRoadTileCache.get(cacheKey);
    const request = (async () => {
      const url = `https://vector.hereapi.com/v2/vectortiles/base/mc/${zoom}/${x}/${y}/omv?apikey=${encodeURIComponent(key)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response;
      try { response = await fetch(url, { signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      if (response.status === 204) return [];
      if (!response.ok) throw new Error(`HERE Vector Tile HTTP ${response.status}`);
      return decodeHereRoadTile(await response.arrayBuffer(), x, y, zoom);
    })();
    hereRoadTileCache.set(cacheKey, request);
    try {
      const result = await request;
      // Keep a small in-memory cache; the browser's HTTP cache handles longer-lived tiles.
      while (hereRoadTileCache.size > 48) hereRoadTileCache.delete(hereRoadTileCache.keys().next().value);
      return result;
    } catch (error) {
      hereRoadTileCache.delete(cacheKey);
      throw error;
    }
  }
  function projectToNearestRoadSegment(point, a, b) {
    const cosLat = Math.max(0.01, Math.cos(point.lat * Math.PI / 180));
    const scaleX = 111320 * cosLat, scaleY = 110574;
    const ax = (a.lng - point.lng) * scaleX, ay = (a.lat - point.lat) * scaleY;
    const bx = (b.lng - point.lng) * scaleX, by = (b.lat - point.lat) * scaleY;
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const t = length2 > 1e-8 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const x = ax + t * dx, y = ay + t * dy;
    return { lng: point.lng + x / scaleX, lat: point.lat + y / scaleY, distanceMeters: Math.hypot(x, y) };
  }
  BLDInternational.findNearestHereRoad = async function (point, key, radiusMeters = HERE_ROAD_SNAP_RADIUS_METERS) {
    const zoom = HERE_ROAD_TILE_ZOOM, latDelta = radiusMeters / 110574;
    const lonDelta = radiusMeters / (111320 * Math.max(0.05, Math.cos(point.lat * Math.PI / 180)));
    const topLeft = hereTileIndex(point.lng - lonDelta, point.lat + latDelta, zoom);
    const bottomRight = hereTileIndex(point.lng + lonDelta, point.lat - latDelta, zoom);
    const n = Math.pow(2, zoom), tilePromises = [];
    for (let y = Math.min(topLeft.y, bottomRight.y); y <= Math.max(topLeft.y, bottomRight.y); y++) {
      for (let x = Math.min(topLeft.x, bottomRight.x); x <= Math.max(topLeft.x, bottomRight.x); x++) {
        tilePromises.push(fetchHereRoadTile(x % n, y, zoom, key));
      }
    }
    const tileRoads = await Promise.all(tilePromises);
    let nearest = null;
    tileRoads.forEach(roads => roads.forEach(road => road.paths.forEach(path => {
      for (let i = 1; i < path.length; i++) {
        const candidate = projectToNearestRoadSegment(point, path[i - 1], path[i]);
        if (candidate.distanceMeters <= radiusMeters && (!nearest || candidate.distanceMeters < nearest.distanceMeters)) {
          nearest = { lng: candidate.lng, lat: candidate.lat, distanceMeters: candidate.distanceMeters, roadKind: road.properties.kind, roadName: road.properties.name || road.properties.ref || '' };
        }
      }
    })));
    return nearest;
  };
  BLDInternational.searchNearbyBusStop = async function (lng, lat, settings) {
    const key = settings.general.hereKey.current.trim();
    if (!key) throw new Error('请先在设置中填写 HERE API Key');
    if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat)) || Math.abs(Number(lng)) > 180 || Math.abs(Number(lat)) > 90) {
      throw new Error('周边搜索坐标无效');
    }
    const at = `${Number(lat)},${Number(lng)}`;
    const q = new URLSearchParams({
      at,
      categories: '400-4100-0042,400-4100-0036',
      in: `circle:${at};r=200`,
      limit: '10',
      lang: 'en-NZ',
      apiKey: key
    });
    const response = await fetch(`https://browse.search.hereapi.com/v1/browse?${q}`);
    let data;
    try { data = await response.json(); } catch (_) { throw new Error(`HERE Browse 返回了无法解析的数据（HTTP ${response.status}）`); }
    if (!response.ok || data.error) {
      throw new Error(data?.cause || data?.title || data?.error_description || data?.message || `HERE Browse HTTP ${response.status}`);
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const candidates = items.map(item => ({
      title: item.title || item.name || item.address?.label || '',
      distance: Number.isFinite(Number(item.distance)) ? Number(item.distance) : Infinity,
      position: item.position
    })).filter(item => item.title && item.position && Number.isFinite(Number(item.position.lat)) && Number.isFinite(Number(item.position.lng)));
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
  };

  BLDInternational.route = async function (provider, from, to, settings) {
    const g = settings.general;
    if (provider === 'AMap') return null;
    if (provider === 'ORS') {
      const key = g.orsKey.current.trim(); if (!key) throw new Error('请先在设置中填写 OpenRouteService API Key');
      const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', { method: 'POST', headers: { 'Authorization': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]], instructions: false }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || j.message || `ORS HTTP ${r.status}`);
      const coords = j.features?.[0]?.geometry?.coordinates || []; if (!coords.length) throw new Error('ORS 未返回路线坐标');
      return coords.map(([lng, lat]) => ({ lng, lat }));
    }
    if (provider === 'HERE') {
      const key = g.hereKey.current.trim(); if (!key) throw new Error('请先在设置中填写 HERE API Key');
      let nearestRoad = null, vectorTileError = null;
      try {
        nearestRoad = await BLDInternational.findNearestHereRoad(to, key, HERE_ROAD_SNAP_RADIUS_METERS);
      } catch (error) {
        vectorTileError = error;
        console.warn('HERE Vector Tile nearest-road lookup failed; falling back to native HERE waypoint matching:', error);
      }
      // When a local road geometry is available, send its exact nearest point.
      // Without radius/radiusPenalty/snapRadius, HERE applies its default nearest-local-road matcher.
      const requestedDestination = nearestRoad || { lat: Number(to.lat), lng: Number(to.lng) };
      const buildRequest = destinationPoint => {
        const q = new URLSearchParams({
          transportMode: 'bus',
          origin: `${Number(from.lat)},${Number(from.lng)}`,
          destination: `${Number(destinationPoint.lat)},${Number(destinationPoint.lng)}`,
          return: 'polyline,summary',
          apiKey: key
        });
        return `https://router.hereapi.com/v8/routes?${q.toString()}`;
      };
      const requestRoute = async destinationPoint => {
        const response = await fetch(buildRequest(destinationPoint));
        let data;
        try { data = await response.json(); } catch (_) { throw new Error(`HERE 返回了无法解析的数据（HTTP ${response.status}）`); }
        if (!response.ok || data.error) throw new Error(data.cause || data.title || data.error_description || `HERE HTTP ${response.status}`);
        const sections = data.routes?.[0]?.sections || [];
        if (!sections.length) throw new Error('HERE 未找到可用路线');
        const coords = [];
        sections.forEach(section => {
          if (!section.polyline) return;
          BLDInternational.decodeHerePolyline(section.polyline).forEach(point => {
            const prev = coords[coords.length - 1];
            if (!prev || Math.abs(prev.lng - point.lng) > 1e-9 || Math.abs(prev.lat - point.lat) > 1e-9) coords.push(point);
          });
        });
        if (coords.length < 2) throw new Error('HERE 未返回有效路线坐标');
        const lastSection = sections[sections.length - 1];
        const matched = lastSection?.arrival?.place?.location;
        const routeMatchedDestination = matched && Number.isFinite(Number(matched.lng)) && Number.isFinite(Number(matched.lat))
          ? { lng: Number(matched.lng), lat: Number(matched.lat) }
          : coords[coords.length - 1];
        const distanceMeters = (a, b) => {
          const rad = Math.PI / 180, dLat = (b.lat-a.lat)*rad, dLng=(b.lng-a.lng)*rad;
          const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
          return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
        };
        const startDistance = distanceMeters(coords[0], from);
        const endDistance = distanceMeters(coords[coords.length - 1], destinationPoint);
        if (startDistance > 5000 || endDistance > 5000) {
          throw new Error(`HERE 路线坐标与输入端点不一致（起点偏差 ${Math.round(startDistance)}m，终点偏差 ${Math.round(endDistance)}m）；已阻止写入异常坐标`);
        }
        return {
          coordinates: coords,
          // Prefer the geometric nearest-road projection for the new station.
          // The route API's own match is retained for diagnostics and may be at a junction.
          snappedDestination: nearestRoad || routeMatchedDestination,
          routeMatchedDestination,
          nearestRoadDistanceMeters: nearestRoad?.distanceMeters ?? null,
          nearestRoadKind: nearestRoad?.roadKind ?? null,
          nearestRoadName: nearestRoad?.roadName ?? '',
          nearestRoadFound: !!nearestRoad,
          routeMatchOffsetMeters: nearestRoad ? distanceMeters(nearestRoad, routeMatchedDestination) : null,
          snapSource: nearestRoad ? 'HERE Vector Tile geometry' : 'HERE native waypoint matcher',
          vectorTileFallback: !!vectorTileError,
          vectorTileErrorMessage: vectorTileError?.message || null
        };
      };
      try {
        return await requestRoute(requestedDestination);
      } catch (firstError) {
        // A geometrically nearest road may not be routable for HERE's bus mode.
        // Retry the original click coordinate once so the router can choose another bus-accessible road.
        if (!nearestRoad) throw firstError;
        console.warn('HERE could not route to the nearest road projection; retrying original click point:', firstError);
        const fallback = await requestRoute({ lat: Number(to.lat), lng: Number(to.lng) });
        fallback.snapSource = 'HERE native waypoint matcher (bus-route fallback)';
        fallback.nearestRoadFound = false;
        fallback.vectorTileFallback = true;
        fallback.snapWarning = firstError.message;
        return fallback;
      }
    }
    throw new Error('未知道路规划引擎');
  };
  global.BLDInternational = BLDInternational;
})(window);
