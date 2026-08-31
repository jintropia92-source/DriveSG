(() => {
  'use strict';

  const SG_BOUNDS = { minLat: 1.16, maxLat: 1.456, minLon: 103.60, maxLon: 104.10 };
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  const PRESETS = [
    { name: 'Marina Bay', subtitle: 'Skyline & waterfront', lat: 1.2829, lon: 103.8587 },
    { name: 'Orchard', subtitle: 'Orchard Road', lat: 1.3048, lon: 103.8321 },
    { name: 'CBD', subtitle: 'Raffles Place', lat: 1.2837, lon: 103.8514 },
    { name: 'Changi', subtitle: 'Airport district', lat: 1.3552, lon: 103.9869 },
    { name: 'Sentosa', subtitle: 'Island drive', lat: 1.2549, lon: 103.8238 },
    { name: 'Toa Payoh', subtitle: 'Heartland roads', lat: 1.3344, lon: 103.8497 },
    { name: 'Jurong East', subtitle: 'West side', lat: 1.3331, lon: 103.7422 },
    { name: 'Woodlands', subtitle: 'North side', lat: 1.4367, lon: 103.7862 }
  ];

  const LANDMARKS = [
    { name: 'Marina Bay Sands', lat: 1.2834, lon: 103.8607, kind: 'mbs' },
    { name: 'Singapore Flyer', lat: 1.2893, lon: 103.8631, kind: 'flyer' },
    { name: 'Esplanade', lat: 1.2897, lon: 103.8553, kind: 'dome' }
  ];

  const ROAD_WIDTHS = {
    motorway: 12.5, motorway_link: 8.5, trunk: 11.5, trunk_link: 8.2,
    primary: 10.5, primary_link: 8, secondary: 8.8, secondary_link: 7.2,
    tertiary: 7.6, tertiary_link: 6.6, residential: 6.2, unclassified: 6,
    living_street: 5.4, service: 5, road: 5
  };

  const ROAD_QUERY = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$';
  const STREAM_TRIGGER_METERS = 430;
  const STREAM_RETRY_SECONDS = 13;
  const ROAD_RADIUS_METERS = 1325;
  const BUILDING_RADIUS_METERS = 560;

  let scene, camera, renderer, clock, sun, sunTarget, horizonHaze;
  let persistentWorld, dynamicWorld;
  let car, carBody, carShadow;
  let frontWheels = [], allWheels = [];
  let origin = { lat: PRESETS[0].lat, lon: PRESETS[0].lon };
  let currentLocationName = PRESETS[0].name;
  let loadedCenterWorld = { x: 0, z: 0 };
  let roadSegments = [];
  let roadIndex = new Map();
  let spawnPose = { x: 0, z: 0, yaw: 0 };
  let speedMps = 0;
  let steeringVisual = 0;
  let onRoad = true;
  let lastOnRoadCheck = 0;
  let lastStreamAttempt = -Infinity;
  let streamBusy = false;
  let streamGeneration = 0;
  let toastTimer;
  let hintTimer;
  let frameCounter = 0;
  let fpsWindowStart = performance.now();
  let qualityPixelRatio = Math.min(window.devicePixelRatio || 1, 1.45);
  let basePixelRatio = qualityPixelRatio;
  let mapMode = 'live';
  let sessionDistanceM = 0;
  let sessionTopSpeedKmh = 0;
  let reverseHold = 0;
  let longitudinalVisual = 0;
  let tailLightMaterial = null;
  let lastRoadLabel = '';
  const mapCache = new Map();

  const input = { gas: 0, brake: 0, steer: 0 };
  const shared = {};

  const els = {
    game: document.getElementById('game'),
    placesPanel: document.getElementById('placesPanel'),
    placesBtn: document.getElementById('placesBtn'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    resetBtn: document.getElementById('resetBtn'),
    nearMeBtn: document.getElementById('nearMeBtn'),
    randomBtn: document.getElementById('randomBtn'),
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    searchMsg: document.getElementById('searchMsg'),
    presetGrid: document.getElementById('presetGrid'),
    locationName: document.getElementById('locationName'),
    mapDot: document.getElementById('mapDot'),
    speed: document.getElementById('speed'),
    gear: document.getElementById('gear'),
    surfaceState: document.getElementById('surfaceState'),
    roadName: document.getElementById('roadName'),
    tripDistance: document.getElementById('tripDistance'),
    topSpeed: document.getElementById('topSpeed'),
    steerZone: document.getElementById('steerZone'),
    steerKnob: document.getElementById('steerKnob'),
    gasBtn: document.getElementById('gasBtn'),
    brakeBtn: document.getElementById('brakeBtn'),
    driveHint: document.getElementById('driveHint'),
    loader: document.getElementById('loader'),
    loaderTitle: document.getElementById('loaderTitle'),
    loaderText: document.getElementById('loaderText'),
    progressBar: document.getElementById('progressBar'),
    progressLabel: document.getElementById('progressLabel'),
    toast: document.getElementById('toast')
  };

  function init() {
    if (!window.THREE) return;
    buildPresetButtons();
    bindUi();
    initThree();
    createCar();
    animate();

    const saved = readSavedPlace();
    const startingPlace = saved || PRESETS[0];
    setPanelOpen(true);
    loadLocation(startingPlace, { keepPanelOpen: true });
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9c5cf);
    scene.fog = new THREE.FogExp2(0xa9c5cf, 0.00125);

    camera = new THREE.PerspectiveCamera(59, viewportWidth() / viewportHeight(), 0.12, 4200);
    camera.position.set(0, 7, -14);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(qualityPixelRatio);
    renderer.setSize(viewportWidth(), viewportHeight(), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    els.game.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xeaf5f8, 0x4b5a46, 2.35);
    scene.add(hemi);

    sun = new THREE.DirectionalLight(0xffeed0, 2.25);
    sun.position.set(-110, 190, -90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.00035;
    scene.add(sun);
    sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sun.target = sunTarget;

    makeSharedMaterials();

    persistentWorld = new THREE.Group();
    scene.add(persistentWorld);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70000, 70000),
      new THREE.MeshStandardMaterial({ color: 0x75806e, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.10;
    ground.receiveShadow = true;
    persistentWorld.add(ground);

    addHorizonHaze();
    clock = new THREE.Clock();

    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) clock.getDelta(); });
  }

  function makeSharedMaterials() {
    shared.road = new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.94, metalness: 0 });
    shared.majorRoad = new THREE.MeshStandardMaterial({ color: 0x292f33, roughness: 0.93, metalness: 0 });
    shared.line = new THREE.MeshBasicMaterial({ color: 0xe1dcc4, transparent: true, opacity: 0.75, depthWrite: false });
    shared.buildings = [
      new THREE.MeshStandardMaterial({ color: 0xbcbeb9, roughness: 0.93 }),
      new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 0.93 }),
      new THREE.MeshStandardMaterial({ color: 0xaeb3b4, roughness: 0.93 }),
      new THREE.MeshStandardMaterial({ color: 0xd3d3cd, roughness: 0.93 })
    ];
    shared.treeTrunk = new THREE.MeshStandardMaterial({ color: 0x625341, roughness: 1 });
    shared.treeLeaf = new THREE.MeshStandardMaterial({ color: 0x567459, roughness: 1 });
  }

  function addHorizonHaze() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x91abb3, transparent: true, opacity: 0.22, depthWrite: false });
    horizonHaze = new THREE.Mesh(new THREE.CylinderGeometry(1500, 1500, 160, 48, 1, true), mat);
    horizonHaze.position.y = 80;
    persistentWorld.add(horizonHaze);
  }

  function createCar() {
    car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f6, metalness: .32, roughness: .28 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x121719, roughness: .65 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x22343e, metalness: .12, roughness: .20 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2ce, emissive: 0x443417, emissiveIntensity: .5 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xbf2732, emissive: 0x5a090e, emissiveIntensity: .65 });
    tailLightMaterial = tailMat;

    carBody = new THREE.Mesh(new THREE.BoxGeometry(1.88, .58, 4.05), bodyMat);
    carBody.position.y = .75;
    carBody.castShadow = true;
    car.add(carBody);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, .20, 1.20), bodyMat);
    hood.position.set(0, 1.03, 1.25); hood.castShadow = true; car.add(hood);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, .72, 1.72), glassMat);
    cabin.position.set(0, 1.27, -.15); cabin.castShadow = true; car.add(cabin);

    const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(1.74, .18, .68), bodyMat);
    rearDeck.position.set(0, 1.01, -1.55); rearDeck.castShadow = true; car.add(rearDeck);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.72, .18, .20), trimMat);
    bumperF.position.set(0, .57, 2.08); car.add(bumperF);
    const bumperR = bumperF.clone(); bumperR.position.z = -2.08; car.add(bumperR);

    const wheelGeo = new THREE.CylinderGeometry(.35, .35, .23, 14);
    [[-.99,.43,1.31],[.99,.43,1.31],[-.99,.43,-1.31],[.99,.43,-1.31]].forEach(([x,y,z], i) => {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(x,y,z);
      const wheel = new THREE.Mesh(wheelGeo, trimMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheelPivot.add(wheel);
      car.add(wheelPivot);
      allWheels.push(wheel);
      if (i < 2) frontWheels.push(wheelPivot);
    });

    [[-.57,.78,2.11],[.57,.78,2.11]].forEach(([x,y,z]) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.34,.15,.05), headMat);
      lamp.position.set(x,y,z); car.add(lamp);
    });
    [[-.57,.78,-2.11],[.57,.78,-2.11]].forEach(([x,y,z]) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.34,.15,.05), tailMat);
      lamp.position.set(x,y,z); car.add(lamp);
    });

    carShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .20, depthWrite: false })
    );
    carShadow.rotation.x = -Math.PI/2;
    carShadow.scale.set(1, 1.8, 1);
    carShadow.position.y = .012;
    car.add(carShadow);

    car.position.y = .07;
    scene.add(car);
  }

  async function loadLocation(place, options = {}) {
    const generation = ++streamGeneration;
    streamBusy = true;
    mapMode = 'live';
    setMapState('loading');
    origin = { lat: place.lat, lon: place.lon };
    currentLocationName = place.name || 'Singapore';
    els.locationName.textContent = currentLocationName;
    els.searchMsg.textContent = '';
    speedMps = 0;
    resetSessionStats();
    input.gas = input.brake = input.steer = 0;
    updateSteerKnob(0);
    showLoader(`Preparing ${currentLocationName}…`, 5);

    try {
      setProgress(16, 'Fetching nearby Singapore roads…');
      const data = await fetchOsmData(place.lat, place.lon);
      if (generation !== streamGeneration) return;
      setProgress(52, 'Optimising the road world for iPhone…');
      const built = buildWorld(data, { centerX: 0, centerZ: 0 });
      if (built.roadCount < 3) throw new Error('Not enough road geometry');
      setProgress(83, 'Placing your car on the road…');
      swapDynamicWorld(built);
      loadedCenterWorld = { x: 0, z: 0 };
      placeCarNear(0, 0, true);
      savePlace(place);
      setProgress(100, 'Ready to drive');
      setMapState('live');
      setTimeout(hideLoader, 220);
      if (!options.keepPanelOpen) closePanel();
      showToast('Live Singapore roads loaded');
    } catch (err) {
      console.warn('Live road data unavailable. Falling back to bundled Marina Bay demo.', err);
      if (generation !== streamGeneration) return;
      setProgress(64, 'Live map unavailable — loading offline demo roads…');
      const built = buildFallbackWorld();
      swapDynamicWorld(built);
      loadedCenterWorld = { x: 0, z: 0 };
      placeCarNear(0, 0, true);
      mapMode = 'demo';
      setProgress(100, 'Ready in demo road mode');
      setMapState('offline');
      setTimeout(hideLoader, 240);
      showToast('Demo roads loaded — live map request failed');
      if (!options.keepPanelOpen) closePanel();
    } finally {
      if (generation === streamGeneration) streamBusy = false;
    }
  }

  async function fetchOsmData(lat, lon) {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (mapCache.has(cacheKey)) return mapCache.get(cacheKey);

    const query = `[out:json][timeout:22];(
      way["highway"~"${ROAD_QUERY}"](around:${ROAD_RADIUS_METERS},${lat},${lon});
      way["building"](around:${BUILDING_RADIUS_METERS},${lat},${lon});
    );out geom;`;

    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`Map service returned ${res.status}`);
        const json = await res.json();
        if (!json?.elements?.length) throw new Error('No map elements returned');
        mapCache.set(cacheKey, json);
        while (mapCache.size > 4) mapCache.delete(mapCache.keys().next().value);
        return json;
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError || new Error('Map request failed');
  }

  function project(lat, lon) {
    const latRad = origin.lat * Math.PI / 180;
    return {
      x: (lon - origin.lon) * 111320 * Math.cos(latRad),
      z: -(lat - origin.lat) * 110540
    };
  }

  function unproject(x, z) {
    const latRad = origin.lat * Math.PI / 180;
    return {
      lat: origin.lat - z / 110540,
      lon: origin.lon + x / (111320 * Math.cos(latRad))
    };
  }

  function buildWorld(data, center = {}) {
    const centerX = Number.isFinite(center.x) ? center.x : (Number.isFinite(center.centerX) ? center.centerX : 0);
    const centerZ = Number.isFinite(center.z) ? center.z : (Number.isFinite(center.centerZ) ? center.centerZ : 0);
    const normalizedCenter = { x: centerX, z: centerZ };
    const group = new THREE.Group();
    const segments = [];
    const roadVerts = [];
    const majorVerts = [];
    const lineVerts = [];
    const buildings = [[], [], [], []];
    let roadCount = 0;

    for (const el of data.elements) {
      if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;
      if (el.tags?.highway) {
        const type = el.tags.highway;
        const width = widthForRoad(el.tags);
        const major = isMajorRoad(type);
        const points = el.geometry.map(p => project(p.lat, p.lon));
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const length = Math.hypot(dx, dz);
          if (length < .6 || length > 1500) continue;
          const seg = {
            ax:a.x, az:a.z, bx:b.x, bz:b.z, width, major,
            oneway: el.tags?.oneway || '',
            name: roadDisplayName(el.tags)
          };
          segments.push(seg);
          appendRoadQuad(major ? majorVerts : roadVerts, seg, 0.025);
          if (major && length > 16) appendCenterDashes(lineVerts, seg);
        }
        roadCount++;
      } else if (el.tags?.building) {
        const b = buildingDescriptor(el, normalizedCenter);
        if (b) buildings[b.bucket].push(b);
      }
    }

    if (roadVerts.length) group.add(meshFromFlatVertices(roadVerts, shared.road, true));
    if (majorVerts.length) group.add(meshFromFlatVertices(majorVerts, shared.majorRoad, true));
    if (lineVerts.length) {
      const lines = meshFromFlatVertices(lineVerts, shared.line, false);
      lines.renderOrder = 3;
      group.add(lines);
    }

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    buildings.forEach((list, bucket) => {
      if (!list.length) return;
      const instanced = new THREE.InstancedMesh(boxGeo, shared.buildings[bucket], list.length);
      instanced.receiveShadow = true;
      instanced.castShadow = false;
      instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const matrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      list.forEach((b, i) => {
        pos.set(b.x, b.h/2, b.z);
        scale.set(b.w, b.h, b.d);
        matrix.compose(pos, quat, scale);
        instanced.setMatrixAt(i, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      group.add(instanced);
    });

    const treeCount = addRoadsideTrees(group, segments, centerX, centerZ);
    addLandmarksTo(group, centerX, centerZ);
    return { group, segments, roadCount, buildingCount: buildings.reduce((n,a)=>n+a.length,0), treeCount };
  }

  function addRoadsideTrees(group, segments, centerX, centerZ) {
    const trees=[];
    const maxTrees=190;
    for(let si=0;si<segments.length && trees.length<maxTrees;si++){
      const seg=segments[si];
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);
      if(len<28)continue;
      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
      const spacing=seg.major?48:68;
      const seed=Math.abs(Math.round(seg.ax*3+seg.az*5+si*17));
      const phase=pseudoRandom(seed+1)*spacing*.7;
      for(let d=spacing*.45+phase;d<len && trees.length<maxTrees;d+=spacing){
        const side=pseudoRandom(seed+Math.round(d)*7)>.5?1:-1;
        const offset=seg.width/2+4.5+pseudoRandom(seed+Math.round(d)*11)*3.8;
        const x=seg.ax+ux*d+nx*offset*side;
        const z=seg.az+uz*d+nz*offset*side;
        if(Math.hypot(x-centerX,z-centerZ)>BUILDING_RADIUS_METERS+260)continue;
        const scale=.72+pseudoRandom(seed+Math.round(d)*13)*.62;
        trees.push({x,z,scale});
      }
    }
    if(!trees.length)return 0;

    const trunkGeo=new THREE.CylinderGeometry(.22,.31,3.1,6);
    const crownGeo=new THREE.IcosahedronGeometry(2.15,1);
    const trunks=new THREE.InstancedMesh(trunkGeo,shared.treeTrunk,trees.length);
    const crowns=new THREE.InstancedMesh(crownGeo,shared.treeLeaf,trees.length);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    trees.forEach((t,i)=>{
      scale.set(t.scale,t.scale,t.scale);
      pos.set(t.x,1.55*t.scale,t.z);
      m.compose(pos,quat,scale);trunks.setMatrixAt(i,m);
      pos.set(t.x,(4.55+(.35*pseudoRandom(i+51)))*t.scale,t.z);
      scale.set(t.scale*(.86+pseudoRandom(i+81)*.25),t.scale*(.82+pseudoRandom(i+91)*.28),t.scale*(.86+pseudoRandom(i+101)*.25));
      m.compose(pos,quat,scale);crowns.setMatrixAt(i,m);
    });
    trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;
    trunks.castShadow=false;trunks.receiveShadow=true;crowns.castShadow=false;crowns.receiveShadow=false;
    group.add(trunks,crowns);
    return trees.length;
  }

  function appendRoadQuad(out, seg, y) {
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const len = Math.hypot(dx,dz) || 1;
    const px = -dz / len * seg.width/2;
    const pz = dx / len * seg.width/2;
    const aL = [seg.ax+px,y,seg.az+pz], aR=[seg.ax-px,y,seg.az-pz];
    const bL = [seg.bx+px,y,seg.bz+pz], bR=[seg.bx-px,y,seg.bz-pz];
    pushTri(out,aL,aR,bR); pushTri(out,aL,bR,bL);
  }

  function appendCenterDashes(out, seg) {
    const dx=seg.bx-seg.ax, dz=seg.bz-seg.az;
    const len=Math.hypot(dx,dz) || 1;
    const ux=dx/len, uz=dz/len;
    const dash=4.2, gap=7.4, step=dash+gap;
    const px=-uz*.075, pz=ux*.075;
    for (let start=3; start<len-2; start+=step) {
      const end=Math.min(len-1.5,start+dash);
      const ax=seg.ax+ux*start, az=seg.az+uz*start;
      const bx=seg.ax+ux*end, bz=seg.az+uz*end;
      const aL=[ax+px,.052,az+pz], aR=[ax-px,.052,az-pz];
      const bL=[bx+px,.052,bz+pz], bR=[bx-px,.052,bz-pz];
      pushTri(out,aL,aR,bR); pushTri(out,aL,bR,bL);
    }
  }

  function pushTri(out,a,b,c) { out.push(...a,...b,...c); }

  function meshFromFlatVertices(vertices, material, receiveShadow) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = false;
    return mesh;
  }

  function buildingDescriptor(el, center) {
    const pts=el.geometry.map(p=>project(p.lat,p.lon));
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    pts.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
    const w=maxX-minX,d=maxZ-minZ;
    if (w<2 || d<2 || w>190 || d>190) return null;
    const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
    if (Math.hypot(x-center.x,z-center.z)>BUILDING_RADIUS_METERS+160) return null;
    let h=Number.parseFloat(el.tags?.height);
    if (!Number.isFinite(h)) {
      const levels=Number.parseFloat(el.tags?.['building:levels']);
      h=Number.isFinite(levels) ? Math.max(3,levels*3.05) : 8+pseudoRandom(el.id)*42;
    }
    h=Math.max(3,Math.min(h,160));
    return { x,z,w,d,h,bucket: Math.abs(Number(el.id)||0)%4 };
  }

  function widthForRoad(tags) {
    const base=ROAD_WIDTHS[tags.highway]||5.5;
    const lanes=Number.parseInt(tags.lanes,10);
    return Number.isFinite(lanes)&&lanes>1 ? Math.max(base,Math.min(15.5,lanes*3.05)) : base;
  }
  function isMajorRoad(type) { return /motorway|trunk|primary|secondary/.test(type); }
  function roadDisplayName(tags = {}) {
    if (tags.name) return tags.name;
    if (tags.ref) return tags.ref;
    const type = String(tags.highway || '').replace(/_/g, ' ');
    if (!type) return 'Singapore road';
    return type.replace(/\b\w/g, c => c.toUpperCase());
  }
  function pseudoRandom(seed) { const x=Math.sin(Number(seed||1)*12.9898)*43758.5453; return x-Math.floor(x); }

  function addLandmarksTo(group, centerX, centerZ) {
    for (const lm of LANDMARKS) {
      const p=project(lm.lat,lm.lon);
      if (Math.hypot(p.x-centerX,p.z-centerZ)>1750) continue;
      if (lm.kind==='mbs') addMbs(group,p.x,p.z);
      else if (lm.kind==='flyer') addFlyer(group,p.x,p.z);
      else if (lm.kind==='dome') addDome(group,p.x,p.z);
    }
  }

  function addMbs(group,x,z) {
    const mat=new THREE.MeshStandardMaterial({color:0xbec6ca,roughness:.66});
    [-34,0,34].forEach(dx=>{ const t=new THREE.Mesh(new THREE.BoxGeometry(24,112,28),mat); t.position.set(x+dx,56,z); group.add(t); });
    const deck=new THREE.Mesh(new THREE.BoxGeometry(105,5,20),new THREE.MeshStandardMaterial({color:0x6d7778,roughness:.5}));
    deck.position.set(x,115,z); group.add(deck);
  }
  function addFlyer(group,x,z) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(42,1.6,8,48),new THREE.MeshStandardMaterial({color:0xd8dcdd,roughness:.55}));
    ring.position.set(x,48,z); ring.rotation.y=Math.PI/2; group.add(ring);
    const stand=new THREE.Mesh(new THREE.BoxGeometry(3,52,3),new THREE.MeshStandardMaterial({color:0x7f898d})); stand.position.set(x,25,z); group.add(stand);
  }
  function addDome(group,x,z) {
    const dome=new THREE.Mesh(new THREE.SphereGeometry(22,18,9,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xb5b2a1,roughness:.9}));
    dome.scale.z=.72; dome.position.set(x,0,z); group.add(dome);
  }

  function buildFallbackWorld() {
    const group=new THREE.Group();
    const segments=[];
    const roadVerts=[],lineVerts=[];
    const roads=[
      [[-520,-60],[-350,-40],[-190,-28],[0,-20],[210,-45],[470,-22]],
      [[-470,180],[-260,145],[-80,120],[110,105],[330,135],[500,190]],
      [[-400,-330],[-250,-190],[-190,-28],[-80,120],[-35,350]],
      [[70,-360],[45,-180],[0,-20],[110,105],[175,340]],
      [[-560,330],[-360,260],[-260,145],[-190,-28],[-110,-240]],
      [[-130,370],[-80,235],[-80,120],[0,-20],[180,-190],[360,-320]],
      [[-510,-220],[-400,-120],[-350,-40],[-260,145],[-130,370]],
      [[470,-22],[330,135],[175,340]]
    ];
    roads.forEach((line,idx)=>{
      const points=line.map(([x,z])=>({x,z}));
      for(let i=0;i<points.length-1;i++){
        const seg={ax:points[i].x,az:points[i].z,bx:points[i+1].x,bz:points[i+1].z,width:idx<4?9.5:7,major:idx<4,oneway:'',name:'DriveSG demo road'};
        segments.push(seg); appendRoadQuad(roadVerts,seg,.025); if(idx<4)appendCenterDashes(lineVerts,seg);
      }
    });
    group.add(meshFromFlatVertices(roadVerts,shared.road,true));
    group.add(meshFromFlatVertices(lineVerts,shared.line,false));

    const boxes=[];
    for(let i=0;i<64;i++){
      const x=-520+pseudoRandom(i+20)*1040,z=-350+pseudoRandom(i+220)*700;
      if(nearestRoadDistanceIn(x,z,segments)<17)continue;
      boxes.push({x,z,w:14+pseudoRandom(i+2)*24,d:14+pseudoRandom(i+3)*25,h:12+pseudoRandom(i+440)*60});
    }
    const geo=new THREE.BoxGeometry(1,1,1); const inst=new THREE.InstancedMesh(geo,shared.buildings[0],boxes.length);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    boxes.forEach((b,i)=>{pos.set(b.x,b.h/2,b.z);scale.set(b.w,b.h,b.d);m.compose(pos,quat,scale);inst.setMatrixAt(i,m);});
    inst.instanceMatrix.needsUpdate=true; group.add(inst);
    const treeCount=addRoadsideTrees(group,segments,0,0);
    addLandmarksTo(group,0,0);
    return {group,segments,roadCount:roads.length,buildingCount:boxes.length,treeCount};
  }

  function swapDynamicWorld(built) {
    const previous=dynamicWorld;
    dynamicWorld=built.group;
    scene.add(dynamicWorld);
    roadSegments=built.segments;
    rebuildRoadIndex();
    if(previous){scene.remove(previous);disposeWorldGroup(previous);}
    console.info(`DriveSG world: ${built.roadCount} road ways, ${built.buildingCount} buildings, ${built.treeCount||0} trees, ${built.segments.length} road segments`);
  }

  function disposeWorldGroup(group) {
    const retained = new Set([shared.road, shared.majorRoad, shared.line, shared.treeTrunk, shared.treeLeaf, ...shared.buildings]);
    group.traverse(obj=>{
      if(obj.geometry) obj.geometry.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(mat=>{ if(!retained.has(mat)) mat.dispose?.(); });
    });
  }

  function rebuildRoadIndex() {
    roadIndex=new Map();
    const cell=100;
    roadSegments.forEach(seg=>{
      const pad=seg.width/2+8;
      const minX=Math.floor((Math.min(seg.ax,seg.bx)-pad)/cell),maxX=Math.floor((Math.max(seg.ax,seg.bx)+pad)/cell);
      const minZ=Math.floor((Math.min(seg.az,seg.bz)-pad)/cell),maxZ=Math.floor((Math.max(seg.az,seg.bz)+pad)/cell);
      for(let gx=minX;gx<=maxX;gx++)for(let gz=minZ;gz<=maxZ;gz++){
        const key=`${gx},${gz}`; if(!roadIndex.has(key))roadIndex.set(key,[]); roadIndex.get(key).push(seg);
      }
    });
  }

  function nearbySegments(x,z,rings=1) {
    const cell=100,gx=Math.floor(x/cell),gz=Math.floor(z/cell),found=[],seen=new Set();
    for(let dx=-rings;dx<=rings;dx++)for(let dz=-rings;dz<=rings;dz++){
      const arr=roadIndex.get(`${gx+dx},${gz+dz}`); if(!arr)continue;
      for(const seg of arr){if(!seen.has(seg)){seen.add(seg);found.push(seg);}}
    }
    return found;
  }

  function closestPointOnSegment(px,pz,seg) {
    const vx=seg.bx-seg.ax,vz=seg.bz-seg.az,len2=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,((px-seg.ax)*vx+(pz-seg.az)*vz)/len2));
    const x=seg.ax+t*vx,z=seg.az+t*vz;
    return {x,z,dist:Math.hypot(px-x,pz-z),t};
  }

  function nearestRoadHit(x,z,wide=false) {
    let candidates=nearbySegments(x,z,wide?5:1);
    if(!candidates.length&&wide)candidates=roadSegments;
    let best=null;
    for(const seg of candidates){const hit=closestPointOnSegment(x,z,seg);if(!best||hit.dist<best.dist)best={...hit,seg};}
    return best;
  }

  function nearestRoadDistanceIn(x,z,segments) {
    let min=Infinity;
    for(const seg of segments){const d=closestPointOnSegment(x,z,seg).dist-seg.width/2;if(d<min)min=d;if(min<0)return 0;}
    return min;
  }

  function nearestRoadDistance(x,z) {
    let min=Infinity;
    const candidates=nearbySegments(x,z,2);
    for(const seg of candidates){const d=closestPointOnSegment(x,z,seg).dist-seg.width/2;if(d<min)min=d;if(min<0)return 0;}
    return min;
  }

  function placeCarNear(x,z,silent=false) {
    const best=nearestRoadHit(x,z,true);
    if(!best)return;
    const seg=best.seg;
    let dx=seg.bx-seg.ax,dz=seg.bz-seg.az;
    if(seg.oneway==='-1'){dx=-dx;dz=-dz;}
    const len=Math.hypot(dx,dz)||1;
    const laneOffset=Math.min(2.25,Math.max(.8,seg.width*.23));
    const leftX=-dz/len,leftZ=dx/len;
    const px=best.x+leftX*laneOffset,pz=best.z+leftZ*laneOffset;
    const yaw=Math.atan2(dx,dz);
    spawnPose={x:px,z:pz,yaw};
    speedMps=0;
    reverseHold=0;
    car.position.set(px,.07,pz);
    car.rotation.set(0,yaw,0);
    steeringVisual=0;
    input.steer=0;
    updateSteerKnob(0);
    if(!silent)showToast('Car reset to the nearest road');
  }

  function resetCar() { placeCarNear(car.position.x,car.position.z,false); }

  function updateCar(dt,elapsed) {
    const panelOpen=els.placesPanel.classList.contains('open');
    const gas=panelOpen?0:input.gas,brake=panelOpen?0:input.brake,steer=panelOpen?0:input.steer;

    const accel=7.0;
    const brakeForce=15.8;
    const reverseAccel=4.8;

    if(gas>0){
      reverseHold=0;
      if(speedMps<-0.45)speedMps+=brakeForce*dt;
      else speedMps+=accel*gas*dt;
    }

    if(brake>0){
      if(speedMps>0.5){
        reverseHold=0;
        speedMps-=brakeForce*brake*dt;
      }else{
        if(speedMps>-.12){
          speedMps=0;
          reverseHold+=dt;
        }
        if(reverseHold>.22 || speedMps<-.12) speedMps-=reverseAccel*brake*dt;
      }
    }else if(!gas){
      reverseHold=0;
    }

    if(!gas&&!brake){
      const drag=(onRoad?0.78:2.9)*dt;
      if(Math.abs(speedMps)<=drag)speedMps=0;else speedMps-=Math.sign(speedMps)*drag;
    }

    const maxForward=onRoad?35.0:12.8;
    speedMps=THREE.MathUtils.clamp(speedMps,-8.8,maxForward);

    const absSpeed=Math.abs(speedMps);
    const steerLimit=THREE.MathUtils.lerp(.46,.17,Math.min(absSpeed/33,1));
    const wheelbase=2.68;
    if(absSpeed>.10){
      const rawYawRate=(speedMps/wheelbase)*Math.tan(steer*steerLimit);
      const yawRate=THREE.MathUtils.clamp(rawYawRate,-1.75,1.75);
      // Camera faces the car's +Z direction from behind; subtracting yaw makes a rightward thumb slide turn right on screen.
      car.rotation.y-=yawRate*dt;
    }

    steeringVisual+=(steer-steeringVisual)*Math.min(1,dt*11);
    const longitudinalTarget=(brake>0?.030:0)-(gas>0?.014:0);
    longitudinalVisual+=(longitudinalTarget-longitudinalVisual)*Math.min(1,dt*7);
    if(carBody){
      carBody.rotation.z=-steeringVisual*.029*Math.min(absSpeed/8,1);
      carBody.rotation.x=longitudinalVisual;
    }
    frontWheels.forEach(p=>p.rotation.y=-steeringVisual*.36);
    const wheelSpin=speedMps*dt/.35;
    allWheels.forEach(w=>w.rotation.x+=wheelSpin);
    if(tailLightMaterial) tailLightMaterial.emissiveIntensity=brake>0?3.0:.65;

    const beforeX=car.position.x,beforeZ=car.position.z;
    const fx=Math.sin(car.rotation.y),fz=Math.cos(car.rotation.y);
    car.position.x+=fx*speedMps*dt;
    car.position.z+=fz*speedMps*dt;

    const coords=unproject(car.position.x,car.position.z);
    if(!insideSingapore(coords.lat,coords.lon)){
      car.position.x=beforeX;
      car.position.z=beforeZ;
      speedMps*=.15;
      showToast('Singapore boundary reached');
    }else if(!panelOpen){
      const moved=Math.hypot(car.position.x-beforeX,car.position.z-beforeZ);
      if(moved<4) sessionDistanceM+=moved;
    }

    if(elapsed-lastOnRoadCheck>.18){
      lastOnRoadCheck=elapsed;
      const hit=nearestRoadHit(car.position.x,car.position.z,false);
      const edgeDist=hit?Math.max(0,hit.dist-hit.seg.width/2):Infinity;
      onRoad=edgeDist<3.0;
      els.surfaceState.textContent=onRoad?'ON ROAD':'OFF ROAD';
      els.surfaceState.classList.toggle('offroad',!onRoad);
      const label=hit?.seg?.name || (onRoad?'Singapore road':'Off road');
      if(label!==lastRoadLabel){
        lastRoadLabel=label;
        if(els.roadName)els.roadName.textContent=label;
      }
    }

    const speedKmh=Math.round(absSpeed*3.6);
    sessionTopSpeedKmh=Math.max(sessionTopSpeedKmh,speedKmh);
    els.speed.textContent=speedKmh;
    els.gear.textContent=speedMps<-.25?'R':'D';
    if(els.tripDistance)els.tripDistance.textContent=formatTripDistance(sessionDistanceM);
    if(els.topSpeed)els.topSpeed.textContent=String(sessionTopSpeedKmh);
  }

  function updateCamera(dt) {
    const fx=Math.sin(car.rotation.y),fz=Math.cos(car.rotation.y);
    const speedRatio=Math.min(Math.abs(speedMps)/35,1);
    const back=THREE.MathUtils.lerp(12.2,15.0,speedRatio);
    const height=THREE.MathUtils.lerp(5.9,6.8,speedRatio);
    const lookAhead=THREE.MathUtils.lerp(4.7,8.0,speedRatio);
    const sideX=fz,sideZ=-fx;
    const anticipation=steeringVisual*THREE.MathUtils.lerp(.25,1.25,speedRatio);
    const desired=new THREE.Vector3(
      car.position.x-fx*back+sideX*anticipation,
      car.position.y+height,
      car.position.z-fz*back+sideZ*anticipation
    );
    const target=new THREE.Vector3(
      car.position.x+fx*lookAhead-sideX*anticipation*.45,
      car.position.y+1.62,
      car.position.z+fz*lookAhead-sideZ*anticipation*.45
    );
    const alpha=1-Math.pow(.0028,dt);
    camera.position.lerp(desired,alpha);
    camera.lookAt(target);

    const desiredFov=59+speedRatio*5.5;
    if(Math.abs(camera.fov-desiredFov)>.02){
      camera.fov+= (desiredFov-camera.fov)*Math.min(1,dt*3.5);
      camera.updateProjectionMatrix();
    }

    sun.position.set(car.position.x-110,190,car.position.z-90);
    sunTarget.position.set(car.position.x,0,car.position.z);
    if(horizonHaze){horizonHaze.position.x=car.position.x;horizonHaze.position.z=car.position.z;}
  }

  function maybeStreamWorld(elapsed) {
    if(mapMode!=='live'||streamBusy||elapsed-lastStreamAttempt<STREAM_RETRY_SECONDS)return;
    const dist=Math.hypot(car.position.x-loadedCenterWorld.x,car.position.z-loadedCenterWorld.z);
    if(dist<STREAM_TRIGGER_METERS)return;
    const coords=unproject(car.position.x,car.position.z);
    if(!insideSingapore(coords.lat,coords.lon))return;
    lastStreamAttempt=elapsed;
    streamAroundCar(coords,car.position.x,car.position.z);
  }

  async function streamAroundCar(coords,centerX,centerZ) {
    streamBusy=true;
    setMapState('loading');
    const generation=streamGeneration;
    try{
      const data=await fetchOsmData(coords.lat,coords.lon);
      if(generation!==streamGeneration)return;
      const built=buildWorld(data,{centerX,centerZ});
      if(built.roadCount<3)throw new Error('Insufficient streamed roads');
      const near=nearestRoadDistanceIn(car.position.x,car.position.z,built.segments);
      if(!Number.isFinite(near)||near>40)throw new Error('Streamed map does not cover the car');
      swapDynamicWorld(built);
      loadedCenterWorld={x:centerX,z:centerZ};
      setMapState('live');
    }catch(err){
      if(generation!==streamGeneration)return;
      console.warn('Background road refresh failed; keeping current world.',err);
      setMapState('offline');
      setTimeout(()=>{ if(mapMode==='live'&&generation===streamGeneration)setMapState('live'); },2500);
    }finally{if(generation===streamGeneration)streamBusy=false;}
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),.045);
    const elapsed=clock.elapsedTime;
    updateCar(dt,elapsed);
    updateCamera(dt);
    maybeStreamWorld(elapsed);
    renderer.render(scene,camera);
    adaptRenderQuality();
  }

  function adaptRenderQuality() {
    frameCounter++;
    const now=performance.now();
    const span=now-fpsWindowStart;
    if(span<2600)return;
    const fps=frameCounter*1000/span;
    const minRatio=.82,maxRatio=basePixelRatio;
    let next=qualityPixelRatio;
    if(fps<42&&qualityPixelRatio>minRatio)next=Math.max(minRatio,qualityPixelRatio-.12);
    else if(fps>57&&qualityPixelRatio<maxRatio)next=Math.min(maxRatio,qualityPixelRatio+.08);
    if(Math.abs(next-qualityPixelRatio)>.02){qualityPixelRatio=next;renderer.setPixelRatio(qualityPixelRatio);renderer.setSize(viewportWidth(),viewportHeight(),false);}
    frameCounter=0;fpsWindowStart=now;
  }

  function buildPresetButtons() {
    els.presetGrid.innerHTML='';
    PRESETS.forEach(place=>{
      const btn=document.createElement('button');btn.type='button';btn.className='preset';
      btn.innerHTML=`<strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.subtitle)}</span>`;
      btn.addEventListener('click',()=>loadLocation(place));
      els.presetGrid.appendChild(btn);
    });
  }

  function bindUi() {
    els.placesBtn.addEventListener('click',()=>setPanelOpen(!els.placesPanel.classList.contains('open')));
    els.closePanelBtn.addEventListener('click',closePanel);
    els.resetBtn.addEventListener('click',resetCar);
    els.randomBtn.addEventListener('click',()=>loadLocation(PRESETS[Math.floor(Math.random()*PRESETS.length)]));
    els.nearMeBtn.addEventListener('click',useCurrentLocation);

    els.searchForm.addEventListener('submit',async e=>{
      e.preventDefault();
      const q=els.searchInput.value.trim();if(!q)return;
      const exact=PRESETS.find(p=>p.name.toLowerCase().includes(q.toLowerCase())||q.toLowerCase().includes(p.name.toLowerCase()));
      if(exact)return loadLocation(exact);
      await searchSingapore(q);
    });

    bindSteering();
    bindPedal(els.gasBtn,'gas');
    bindPedal(els.brakeBtn,'brake');

    document.addEventListener('contextmenu',e=>e.preventDefault());
    ['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,e=>e.preventDefault(),{passive:false}));
    window.addEventListener('blur',clearInputs);

    // Keyboard support exists only to make local debugging convenient; the product UI remains iPhone-first.
    window.addEventListener('keydown',e=>{
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
      if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')input.gas=1;
      if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')input.brake=1;
      if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){input.steer=-1;updateSteerKnob(-1);}
      if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){input.steer=1;updateSteerKnob(1);}
      if(e.key.toLowerCase()==='r')resetCar();
    },{passive:false});
    window.addEventListener('keyup',e=>{
      if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')input.gas=0;
      if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')input.brake=0;
      if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)){input.steer=0;updateSteerKnob(0);}
    });
  }

  function bindSteering() {
    let pointerId=null;
    const update=e=>{
      if(pointerId!==e.pointerId)return;
      const rect=els.steerZone.getBoundingClientRect();
      const center=rect.left+rect.width/2;
      const usable=Math.max(20,rect.width/2-31);
      let value=(e.clientX-center)/usable;
      value=THREE.MathUtils.clamp(value,-1,1);
      if(Math.abs(value)<.045)value=0;
      input.steer=value;
      updateSteerKnob(value);
    };
    els.steerZone.addEventListener('pointerdown',e=>{
      e.preventDefault(); pointerId=e.pointerId; els.steerZone.setPointerCapture?.(e.pointerId); update(e); hideHint();
    },{passive:false});
    els.steerZone.addEventListener('pointermove',e=>{if(pointerId===e.pointerId){e.preventDefault();update(e);}},{passive:false});
    const end=e=>{
      if(pointerId!==e.pointerId)return;
      e.preventDefault(); pointerId=null; input.steer=0; updateSteerKnob(0);
    };
    els.steerZone.addEventListener('pointerup',end,{passive:false});
    els.steerZone.addEventListener('pointercancel',end,{passive:false});
  }

  function updateSteerKnob(value) {
    const rect=els.steerZone.getBoundingClientRect();
    const usable=Math.max(20,(rect.width||200)/2-31);
    els.steerKnob.style.transform=`translateX(calc(-50% + ${value*usable}px))`;
  }

  function bindPedal(btn,name) {
    const down=e=>{e.preventDefault();input[name]=1;btn.classList.add('active');btn.setPointerCapture?.(e.pointerId);hideHint();};
    const up=e=>{e.preventDefault();input[name]=0;btn.classList.remove('active');};
    btn.addEventListener('pointerdown',down,{passive:false});
    btn.addEventListener('pointerup',up,{passive:false});
    btn.addEventListener('pointercancel',up,{passive:false});
    btn.addEventListener('lostpointercapture',up,{passive:false});
  }

  function clearInputs() { input.gas=input.brake=input.steer=0; reverseHold=0; els.gasBtn.classList.remove('active');els.brakeBtn.classList.remove('active');updateSteerKnob(0); }

  function setPanelOpen(open) {
    els.placesPanel.classList.toggle('open',open);
    document.body.classList.toggle('panel-open',open);
    clearInputs();
    if(!open)showDriveHint();
  }
  function closePanel(){setPanelOpen(false);}

  function showDriveHint(){clearTimeout(hintTimer);els.driveHint.classList.add('show');hintTimer=setTimeout(()=>els.driveHint.classList.remove('show'),4200);}
  function hideHint(){clearTimeout(hintTimer);els.driveHint.classList.remove('show');}

  async function useCurrentLocation() {
    if(!navigator.geolocation){els.searchMsg.textContent='Location is not available in this browser.';return;}
    els.searchMsg.textContent='Getting your location…';
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const lat=pos.coords.latitude,lon=pos.coords.longitude;
        if(!insideSingapore(lat,lon)){els.searchMsg.textContent='Your current location appears to be outside Singapore.';return;}
        loadLocation({name:'Near me',subtitle:'Current location',lat,lon});
      },
      ()=>{els.searchMsg.textContent='Safari did not provide your location. You can pick a place below instead.';},
      {enableHighAccuracy:false,timeout:9000,maximumAge:120000}
    );
  }

  async function searchSingapore(query) {
    els.searchMsg.textContent='Searching Singapore…';
    try{
      const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=sg&q=${encodeURIComponent(query+', Singapore')}`;
      const res=await fetch(url,{headers:{Accept:'application/json'}});
      if(!res.ok)throw new Error(`Search ${res.status}`);
      const results=await res.json();if(!results.length)throw new Error('No match');
      const lat=Number(results[0].lat),lon=Number(results[0].lon);if(!insideSingapore(lat,lon))throw new Error('Outside Singapore');
      const label=(results[0].display_name||query).split(',')[0];
      await loadLocation({name:label,subtitle:'Search result',lat,lon});
    }catch(err){console.warn(err);els.searchMsg.textContent='Could not find that. Try a Singapore road, district or landmark.';}
  }

  function insideSingapore(lat,lon){return lat>=SG_BOUNDS.minLat&&lat<=SG_BOUNDS.maxLat&&lon>=SG_BOUNDS.minLon&&lon<=SG_BOUNDS.maxLon;}

  function resetSessionStats(){
    sessionDistanceM=0;
    sessionTopSpeedKmh=0;
    reverseHold=0;
    lastRoadLabel='';
    if(els.tripDistance)els.tripDistance.textContent='0 m';
    if(els.topSpeed)els.topSpeed.textContent='0';
    if(els.roadName)els.roadName.textContent=currentLocationName || 'Singapore road';
  }

  function formatTripDistance(meters){
    if(meters<1000)return `${Math.round(meters)} m`;
    return `${(meters/1000).toFixed(meters<10000?1:0)} km`;
  }

  function showLoader(text,pct){els.loader.classList.remove('hidden');els.loaderTitle.textContent='Building Singapore';setProgress(pct,text);}
  function hideLoader(){els.loader.classList.add('hidden');}
  function setProgress(pct,text){const p=Math.max(0,Math.min(100,pct));els.progressBar.style.width=`${p}%`;els.progressLabel.textContent=`${Math.round(p)}%`;if(text)els.loaderText.textContent=text;}

  function setMapState(state){
    els.mapDot.classList.remove('loading','offline');
    if(state==='loading')els.mapDot.classList.add('loading');
    if(state==='offline')els.mapDot.classList.add('offline');
  }

  function showToast(message){els.toast.textContent=message;els.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.classList.remove('show'),2200);}

  function savePlace(place){try{localStorage.setItem('drivesg-last-place',JSON.stringify({name:place.name,subtitle:place.subtitle||'',lat:place.lat,lon:place.lon}));}catch(_){} }
  function readSavedPlace(){try{const p=JSON.parse(localStorage.getItem('drivesg-last-place')||'null');return p&&insideSingapore(Number(p.lat),Number(p.lon))?p:null;}catch(_){return null;}}

  function viewportWidth(){return Math.max(1,window.visualViewport?.width||window.innerWidth||document.documentElement.clientWidth||1);}
  function viewportHeight(){return Math.max(1,window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight||1);}
  function onResize(){if(!renderer||!camera)return;const w=viewportWidth(),h=viewportHeight();camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(qualityPixelRatio);renderer.setSize(w,h,false);updateSteerKnob(input.steer);}

  function escapeHtml(str){return String(str).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));}

  init();
})();
