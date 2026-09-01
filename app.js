(() => {
  'use strict';

  const SG_BOUNDS = { minLat: 1.16, maxLat: 1.456, minLon: 103.60, maxLon: 104.10 };
  const CONFIG = window.DRIVESG_CONFIG || {};
  const OVERPASS_ENDPOINTS = Array.isArray(CONFIG.overpassEndpoints) && CONFIG.overpassEndpoints.length
    ? CONFIG.overpassEndpoints
    : ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  // External data providers are kept configurable so a managed/private backend can replace public demo services
  // without rewriting the driving, navigation or UI layers.
  const ROUTE_ENDPOINT = CONFIG.routeEndpoint || 'https://router.project-osrm.org/route/v1/driving';
  const GEOCODE_ENDPOINT = CONFIG.geocodeEndpoint || 'https://nominatim.openstreetmap.org/search';
  const BACKEND_BASE = String(CONFIG.backendBase || '').replace(/\/$/, '');
  const BACKEND_ACTIVE = Boolean(BACKEND_BASE);
  const ENVIRONMENT_REFRESH_SECONDS = 240;
  const TRAFFIC_REFRESH_SECONDS = 75;
  const ROUTE_OFFTRACK_METERS = 52;
  const ROUTE_REROUTE_COOLDOWN = 11;
  const ARRIVAL_METERS = 24;
  const NAV_UPDATE_SECONDS = .14;
  const ROUTE_PREFETCH_METERS = 520;
  const ROUTE_PREFETCH_INTERVAL = 12;
  const MAX_BUILDING_WINDOWS = 9200;
  const MAX_FACADE_BUILDINGS = 280;
  const MAX_STREET_LIGHTS = 180;
  const BRIDGE_BASE_HEIGHT = 5.4;

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
    { name: 'Esplanade', lat: 1.2897, lon: 103.8553, kind: 'dome' },
    { name: 'ArtScience Museum', lat: 1.2863, lon: 103.8593, kind: 'artscience' },
    { name: 'Merlion', lat: 1.2868, lon: 103.8545, kind: 'merlion' },
    { name: 'Supertree Grove', lat: 1.2816, lon: 103.8636, kind: 'supertrees' },
    { name: 'Marina Bay Financial Centre', lat: 1.2795, lon: 103.8544, kind: 'mbfc' },
    { name: 'Fullerton Hotel', lat: 1.2862, lon: 103.8531, kind: 'fullerton' },
    { name: 'ION Orchard', lat: 1.3040, lon: 103.8319, kind: 'ion' },
    { name: 'Ngee Ann City', lat: 1.3028, lon: 103.8348, kind: 'ngeeann' },
    { name: 'Orchard Gateway', lat: 1.3007, lon: 103.8396, kind: 'orchardgateway' },
    { name: 'Jewel Changi Airport', lat: 1.3602, lon: 103.9896, kind: 'jewel' }
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
  const ROAD_RADIUS_METERS = 1450;
  const BUILDING_RADIUS_METERS = 720;
  const SURFACE_RADIUS_METERS = 860;
  const MAX_BUILDINGS = 950;
  const SIGNAL_RADIUS_METERS = 900;
  const MAX_TRAFFIC_SIGNALS = 140;
  const MAX_CROSSINGS = 140;
  const MAX_BUS_STOPS = 90;
  const MAX_AMBIENT_TRAFFIC = 18;
  const MINI_MAP_RANGE_DEFAULT = 360;

  let scene, camera, renderer, clock, sun, sunTarget, horizonHaze, hemi;
  let persistentWorld, dynamicWorld;
  let car, carBody, carShadow;
  let frontWheels = [], allWheels = [];
  let origin = { lat: PRESETS[0].lat, lon: PRESETS[0].lon };
  let currentLocationName = PRESETS[0].name;
  let loadedCenterWorld = { x: 0, z: 0 };
  let roadSegments = [];
  let roadIndex = new Map();
  let buildingColliders = [];
  let buildingIndex = new Map();
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
  let lastSpeedLimit = null;
  let placeMode = 'navigate';
  let miniMapHeadingUp = true;
  let miniMapExpanded = false;
  let lastMiniMapPaint = -Infinity;
  let engineAudio = null;
  let engineSoundOn = false;
  let ambientTraffic = [];
  let trafficMesh = null;
  let trafficMaterial = null;
  let roadGraph = new Map();
  let trafficSignalsWorld = [];
  let carRoadY = 0;
  let carHeadlight = null;
  let carHeadlightTarget = null;
  let lightingMode = 'auto';
  let lightingNightFactor = 0;
  let lightingSunHour = 13;
  let lastLightingUpdate = -Infinity;
  let lastRoutePrefetch = -Infinity;
  let routePrefetchBusy = false;
  let currentWaterPolygons = [];
  let currentParkPolygons = [];
  let lastNavUpdate = -Infinity;
  let navigation = makeEmptyNavigation();
  let environmentState = { condition:'clear', precipitationMm:0, cloudPct:25, temperatureC:null, humidityPct:null, windKmh:null, provider:'' };
  let environmentBusy = false;
  let lastEnvironmentRefresh = -Infinity;
  let rainPoints = null;
  let rainPositions = null;
  let wetness = 0;
  let trafficDataBusy = false;
  let lastTrafficDataRefresh = -Infinity;
  let liveTrafficBands = [];
  let liveTrafficIncidents = [];
  let lastIncidentToastKey = '';
  const mapCache = new Map();
  const geocodeCache = new Map();

  const input = { gas: 0, brake: 0, steer: 0 };
  const shared = {};

  const els = {
    game: document.getElementById('game'),
    placesPanel: document.getElementById('placesPanel'),
    placesBtn: document.getElementById('placesBtn'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    resetBtn: document.getElementById('resetBtn'),
    lightingBtn: document.getElementById('lightingBtn'),
    soundBtn: document.getElementById('soundBtn'),
    weatherBadge: document.getElementById('weatherBadge'),
    weatherIcon: document.getElementById('weatherIcon'),
    weatherText: document.getElementById('weatherText'),
    nearMeBtn: document.getElementById('nearMeBtn'),
    randomBtn: document.getElementById('randomBtn'),
    randomBtnLabel: document.getElementById('randomBtnLabel'),
    navigateModeBtn: document.getElementById('navigateModeBtn'),
    startModeBtn: document.getElementById('startModeBtn'),
    panelTitle: document.getElementById('panelTitle'),
    panelIntro: document.getElementById('panelIntro'),
    placeEyebrow: document.getElementById('placeEyebrow'),
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    searchMsg: document.getElementById('searchMsg'),
    presetGrid: document.getElementById('presetGrid'),
    recentSection: document.getElementById('recentSection'),
    recentGrid: document.getElementById('recentGrid'),
    locationName: document.getElementById('locationName'),
    mapDot: document.getElementById('mapDot'),
    speed: document.getElementById('speed'),
    gear: document.getElementById('gear'),
    surfaceState: document.getElementById('surfaceState'),
    roadName: document.getElementById('roadName'),
    tripDistance: document.getElementById('tripDistance'),
    topSpeed: document.getElementById('topSpeed'),
    speedLimit: document.getElementById('speedLimit'),
    navBanner: document.getElementById('navBanner'),
    navArrow: document.getElementById('navArrow'),
    navInstruction: document.getElementById('navInstruction'),
    navTurnDistance: document.getElementById('navTurnDistance'),
    navDestinationName: document.getElementById('navDestinationName'),
    navRemaining: document.getElementById('navRemaining'),
    navEta: document.getElementById('navEta'),
    cancelNavBtn: document.getElementById('cancelNavBtn'),
    miniMapCard: document.getElementById('miniMapCard'),
    miniMapCanvas: document.getElementById('miniMapCanvas'),
    miniMapFooter: document.getElementById('miniMapFooter'),
    compassLabel: document.getElementById('compassLabel'),
    mapOrientationBtn: document.getElementById('mapOrientationBtn'),
    mapExpandBtn: document.getElementById('mapExpandBtn'),
    routingCredit: document.getElementById('routingCredit'),
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

  async function init() {
    if (!window.THREE) return;
    buildPresetButtons();
    buildRecentDestinations();
    bindUi();
    try{
      miniMapHeadingUp=localStorage.getItem('drivesg-map-heading-up')!=='0';
      lightingMode=localStorage.getItem('drivesg-lighting-mode')||'auto';
    }catch(_){}
    if(!['auto','day','dusk','night'].includes(lightingMode))lightingMode='auto';
    els.mapOrientationBtn.textContent=miniMapHeadingUp?'↗':'N';
    updateLightingButton();
    setPlaceMode('navigate');
    initThree();
    createCar();
    createRainSystem();
    registerServiceWorker();
    animate();

    const saved = readSavedPlace();
    const startingPlace = saved || PRESETS[0];
    setPanelOpen(true);
    await loadLocation(startingPlace, { keepPanelOpen: true });
    const restore=readActiveDestination();
    if(restore)navigateTo(restore,{quiet:true});
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    els.game.appendChild(renderer.domElement);

    hemi = new THREE.HemisphereLight(0xeaf5f8, 0x4b5a46, 2.35);
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
    shared.sidewalk = new THREE.MeshStandardMaterial({ color: 0x9b9a92, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    shared.roadEdge = new THREE.MeshStandardMaterial({ color: 0x747873, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    shared.road = new THREE.MeshStandardMaterial({ color: 0x34393d, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
    shared.majorRoad = new THREE.MeshStandardMaterial({ color: 0x292e32, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    shared.line = new THREE.MeshBasicMaterial({ color: 0xf0ead7, transparent: true, opacity: 0.86, depthWrite: false, side: THREE.DoubleSide });
    shared.median = new THREE.MeshStandardMaterial({ color: 0x697665, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    shared.bridge = new THREE.MeshStandardMaterial({ color: 0x6f7577, roughness: .92, metalness: .04, side: THREE.DoubleSide });
    shared.tunnel = new THREE.MeshStandardMaterial({ color: 0x32383a, roughness: .96, metalness: 0, side: THREE.DoubleSide });
    shared.water = new THREE.MeshStandardMaterial({ color: 0x527d8d, roughness: 0.72, metalness: 0.03, transparent: true, opacity: 0.93, side: THREE.DoubleSide });
    shared.park = new THREE.MeshStandardMaterial({ color: 0x688268, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    shared.buildings = [
      new THREE.MeshStandardMaterial({ color: 0xc7c0b3, roughness: 0.90, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xb9c3c7, roughness: 0.86, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xa9adae, roughness: 0.94, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xd0cdc4, roughness: 0.92, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x8fa3ad, roughness: 0.34, metalness: .12, side: THREE.DoubleSide })
    ];
    shared.windows = new THREE.MeshStandardMaterial({ color: 0x263842, emissive: 0x14232d, emissiveIntensity: .08, roughness: .28, metalness: .12, side: THREE.DoubleSide });
    shared.storefront = new THREE.MeshStandardMaterial({ color: 0x395967, emissive: 0x20343e, emissiveIntensity: .12, roughness: .24, metalness: .10, side: THREE.DoubleSide });
    shared.treeTrunk = new THREE.MeshStandardMaterial({ color: 0x625341, roughness: 1 });
    shared.treeLeaf = new THREE.MeshStandardMaterial({ color: 0x567459, roughness: 1 });
    shared.signalPole = new THREE.MeshStandardMaterial({ color: 0x3d4142, roughness: .92 });
    shared.signalHead = new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: .82 });
    shared.signalRed = new THREE.MeshStandardMaterial({ color: 0x8e2c2f, emissive: 0x250506, emissiveIntensity: .55, roughness: .65 });
    shared.signalAmber = new THREE.MeshStandardMaterial({ color: 0xa98131, emissive: 0x211404, emissiveIntensity: .32, roughness: .65 });
    shared.signalGreen = new THREE.MeshStandardMaterial({ color: 0x3d7c57, emissive: 0x061d0e, emissiveIntensity: .32, roughness: .65 });
    shared.busStopPole = new THREE.MeshStandardMaterial({ color: 0x545a5c, roughness: .9 });
    shared.busStopSign = new THREE.MeshStandardMaterial({ color: 0x2d6e94, roughness: .72 });
    shared.streetPole = new THREE.MeshStandardMaterial({ color: 0x555b5c, roughness: .9 });
    shared.streetLamp = new THREE.MeshStandardMaterial({ color: 0xe8dfc2, emissive: 0xffd98a, emissiveIntensity: .12, roughness: .5 });
    shared.gantryPole = new THREE.MeshStandardMaterial({ color: 0x606769, roughness: .88 });
    shared.gantrySign = new THREE.MeshStandardMaterial({ color: 0x1e6a4b, roughness: .72 });
    shared.routeUnder = new THREE.MeshBasicMaterial({ color: 0x0a1417, transparent: true, opacity: .58, depthWrite: false, side: THREE.DoubleSide });
    shared.route = new THREE.MeshBasicMaterial({ color: 0x73e2c4, transparent: true, opacity: .96, depthWrite: false, side: THREE.DoubleSide });
    shared.routeArrow = new THREE.MeshBasicMaterial({ color: 0xe9fff7, transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide });
    shared.destination = new THREE.MeshBasicMaterial({ color: 0x7af0ca, transparent: true, opacity: .72, depthWrite: false });
    trafficMaterial = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: .18, roughness: .54 });
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

    carHeadlight = new THREE.SpotLight(0xffefd0,0,58,Math.PI/5,.42,1.25);
    carHeadlight.position.set(0,1.15,1.92);
    carHeadlightTarget = new THREE.Object3D();
    carHeadlightTarget.position.set(0,.25,18);
    car.add(carHeadlight,carHeadlightTarget);
    carHeadlight.target=carHeadlightTarget;

    car.position.y = .07;
    scene.add(car);
  }

  async function loadLocation(place, options = {}) {
    if(navigation.active||navigation.routeGroup)clearNavigation({quiet:true});
    const generation = ++streamGeneration;
    streamBusy = true;
    mapMode = 'live';
    setMapState('loading');
    origin = { lat: place.lat, lon: place.lon };
    currentLocationName = place.name || 'Singapore';
    els.locationName.textContent = currentLocationName;
    els.placeEyebrow.textContent = 'DRIVING AROUND';
    els.searchMsg.textContent = '';
    lastSpeedLimit=null;
    els.speedLimit?.classList.add('hidden');
    speedMps = 0;
    resetSessionStats();
    input.gas = input.brake = input.steer = 0;
    updateSteerKnob(0);
    showLoader(`Preparing ${currentLocationName}…`, 5);

    try {
      setProgress(16, 'Fetching nearby Singapore roads…');
      const data = await fetchOsmData(place.lat, place.lon);
      if (generation !== streamGeneration) return;
      setProgress(52, 'Drawing real road and building geometry…');
      const built = buildWorld(data, { centerX: 0, centerZ: 0 });
      if (built.roadCount < 3) throw new Error('Not enough road geometry');
      setProgress(86, `${built.roadCount} roads · ${built.buildingCount} building footprints`);
      swapDynamicWorld(built);
      loadedCenterWorld = { x: 0, z: 0 };
      placeCarNear(0, 0, true);
      savePlace(place);
      setProgress(100, 'Ready to drive');
      setMapState('live');
      setTimeout(hideLoader, 220);
      if (!options.keepPanelOpen) { setPlaceMode('navigate'); closePanel(); }
      showToast(`${built.roadCount} roads · ${built.buildingCount} real buildings loaded`);
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
      if (!options.keepPanelOpen) { setPlaceMode('navigate'); closePanel(); }
    } finally {
      if (generation === streamGeneration) streamBusy = false;
    }
  }

  async function fetchOsmData(lat, lon) {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (mapCache.has(cacheKey)) return mapCache.get(cacheKey);
    for(const cached of mapCache.values()){
      const c=cached?._driveCenter;if(c&&haversineMeters(lat,lon,c.lat,c.lon)<185)return cached;
    }

    if(BACKEND_ACTIVE){
      const controller=new AbortController(),timeoutId=setTimeout(()=>controller.abort(),18000);
      try{
        const url=`${BACKEND_BASE}/api/map?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&roadRadius=${ROAD_RADIUS_METERS}&buildingRadius=${BUILDING_RADIUS_METERS}&surfaceRadius=${SURFACE_RADIUS_METERS}&signalRadius=${SIGNAL_RADIUS_METERS}`;
        const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
        if(res.ok){
          const json=await res.json();
          if(json?.elements?.length){json._driveCenter=json._driveCenter||{lat,lon};mapCache.set(cacheKey,json);while(mapCache.size>6)mapCache.delete(mapCache.keys().next().value);return json;}
        }
      }catch(err){console.warn('DriveSG backend map fallback',err?.message||err);}
      finally{clearTimeout(timeoutId);}
    }

    const query = `[out:json][timeout:24];(
      way["highway"~"${ROAD_QUERY}"](around:${ROAD_RADIUS_METERS},${lat},${lon});
      way["building"](around:${BUILDING_RADIUS_METERS},${lat},${lon});
      way["building:part"](around:${BUILDING_RADIUS_METERS},${lat},${lon});
      way["natural"="water"](around:${SURFACE_RADIUS_METERS},${lat},${lon});
      way["waterway"="riverbank"](around:${SURFACE_RADIUS_METERS},${lat},${lon});
      way["leisure"="park"](around:${SURFACE_RADIUS_METERS},${lat},${lon});
      way["landuse"~"^(grass|recreation_ground|meadow)$"](around:${SURFACE_RADIUS_METERS},${lat},${lon});
      node["highway"="traffic_signals"](around:${SIGNAL_RADIUS_METERS},${lat},${lon});
      node["highway"="crossing"](around:${SIGNAL_RADIUS_METERS},${lat},${lon});
      node["highway"="bus_stop"](around:${SIGNAL_RADIUS_METERS},${lat},${lon});
    );out geom;`;

    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 21000);
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
        json._driveCenter={lat,lon};
        mapCache.set(cacheKey, json);
        while (mapCache.size > 6) mapCache.delete(mapCache.keys().next().value);
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


  function makeEmptyNavigation() {
    return {
      active:false, mode:'idle', fetching:false, destination:null,
      routeCoords:[], routeWorld:[], cumulativeM:[], totalM:0, durationS:0,
      steps:[], progressM:0, remainingM:0, remainingS:0, nearestIndex:0,
      nearestDistance:Infinity, routeGroup:null, lastRerouteAt:-Infinity,
      lastInstructionKey:'', arrived:false
    };
  }

  function currentCarCoords() {
    return car ? unproject(car.position.x,car.position.z) : {lat:origin.lat,lon:origin.lon};
  }

  async function navigateTo(place, options={}) {
    if(!place || !insideSingapore(Number(place.lat),Number(place.lon))) {
      showToast('Choose a destination inside Singapore');
      return;
    }
    const start=currentCarCoords();
    const direct=haversineMeters(start.lat,start.lon,place.lat,place.lon);
    if(direct<ARRIVAL_METERS*1.4){
      showToast(`You are already near ${place.name}`);
      return;
    }
    navigation.destination={name:place.name||'Destination',subtitle:place.subtitle||'',lat:Number(place.lat),lon:Number(place.lon)};
    navigation.active=true;
    navigation.arrived=false;
    saveRecentDestination(navigation.destination);
    saveActiveDestination(navigation.destination);
    buildRecentDestinations();
    closePanel();
    await requestNavigationRoute(start,navigation.destination,{reroute:false,quiet:options.quiet});
  }

  async function requestNavigationRoute(start,destination,{reroute=false,quiet=false}={}) {
    if(!destination)return;
    navigation.fetching=true;
    navigation.active=true;
    navigation.mode=navigation.routeWorld.length?'route':'loading';
    navigation.lastRerouteAt=clock?.elapsedTime||0;
    els.navBanner.classList.add('show');
    els.navBanner.classList.toggle('rerouting',reroute);
    els.navArrow.textContent=reroute?'↻':'⌁';
    els.navArrow.style.transform='none';
    els.navInstruction.textContent=reroute?'Re-routing…':`Finding the best drive to ${destination.name}…`;
    els.navTurnDistance.textContent='';
    els.navDestinationName.textContent=destination.name;
    els.navRemaining.textContent='—';
    els.navEta.textContent='';

    const controller=new AbortController();
    const timeoutId=setTimeout(()=>controller.abort(),12000);
    try{
      const url=BACKEND_ACTIVE
        ?`${BACKEND_BASE}/api/route?startLat=${encodeURIComponent(start.lat)}&startLon=${encodeURIComponent(start.lon)}&endLat=${encodeURIComponent(destination.lat)}&endLon=${encodeURIComponent(destination.lon)}`
        :`${ROUTE_ENDPOINT}/${start.lon},${start.lat};${destination.lon},${destination.lat}?steps=true&geometries=geojson&overview=full&alternatives=false`;
      let res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
      if(!res.ok&&BACKEND_ACTIVE){
        const fallback=`${ROUTE_ENDPOINT}/${start.lon},${start.lat};${destination.lon},${destination.lat}?steps=true&geometries=geojson&overview=full&alternatives=false`;
        res=await fetch(fallback,{headers:{Accept:'application/json'},signal:controller.signal});
      }
      if(!res.ok)throw new Error(`Routing ${res.status}`);
      const data=await res.json();
      if(data?.code!=='Ok'||!data.routes?.length)throw new Error(data?.code||'No route');
      applyRoute(data.routes[0],destination);
      if(!quiet)showToast(`Route ready · ${formatDistance(navigation.totalM)} · ${formatEta(navigation.durationS)}`);
    }catch(err){
      console.warn('Drive route unavailable; using compass guidance.',err);
      activateCompassGuidance(destination);
      if(!quiet)showToast('Route service unavailable — compass guidance active');
    }finally{
      clearTimeout(timeoutId);
      navigation.fetching=false;
      els.navBanner.classList.remove('rerouting');
    }
  }

  function applyRoute(route,destination) {
    const coords=(route.geometry?.coordinates||[])
      .map(c=>({lon:Number(c[0]),lat:Number(c[1])}))
      .filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lon));
    if(coords.length<2)throw new Error('Route geometry missing');

    navigation.destination={...destination};
    navigation.routeCoords=coords;
    navigation.routeWorld=coords.map(c=>project(c.lat,c.lon));
    navigation.cumulativeM=[0];
    let sum=0;
    for(let i=1;i<coords.length;i++){
      sum+=haversineMeters(coords[i-1].lat,coords[i-1].lon,coords[i].lat,coords[i].lon);
      navigation.cumulativeM.push(sum);
    }
    navigation.totalM=Number(route.distance)||sum;
    navigation.durationS=Math.max(1,Number(route.duration)||navigation.totalM/11);
    navigation.progressM=0;
    navigation.remainingM=navigation.totalM;
    navigation.remainingS=navigation.durationS;
    navigation.nearestIndex=0;
    navigation.nearestDistance=0;
    navigation.steps=[];
    for(const leg of route.legs||[]) for(const step of leg.steps||[]) {
      const loc=step?.maneuver?.location;
      if(!Array.isArray(loc)||loc.length<2)continue;
      const wp=project(Number(loc[1]),Number(loc[0]));
      const progress=routeProgressForPoint(wp.x,wp.z,true).progressM;
      navigation.steps.push({
        progressM:progress,
        distance:Number(step.distance)||0,
        duration:Number(step.duration)||0,
        name:step.name||'',
        type:step.maneuver?.type||'continue',
        modifier:step.maneuver?.modifier||'straight',
        exit:step.maneuver?.exit||null,
        bearingAfter:step.maneuver?.bearing_after
      });
    }
    navigation.steps.sort((a,b)=>a.progressM-b.progressM);
    navigation.mode='route';
    navigation.active=true;
    navigation.arrived=false;
    navigation.lastInstructionKey='';
    renderNavigationWorld();
    els.routingCredit.textContent=' · routing by OSRM';
    els.navBanner.classList.add('show');
    updateNavigationUi(0);
  }

  function activateCompassGuidance(destination) {
    disposeNavigationVisual();
    navigation.mode='compass';
    navigation.active=true;
    navigation.destination={...destination};
    navigation.routeCoords=[];
    navigation.routeWorld=[];
    navigation.cumulativeM=[];
    const here=currentCarCoords();
    navigation.totalM=haversineMeters(here.lat,here.lon,destination.lat,destination.lon);
    navigation.remainingM=navigation.totalM;
    navigation.durationS=0;
    navigation.steps=[];
    renderDestinationMarker();
    els.routingCredit.textContent='';
    els.navBanner.classList.add('show');
    updateNavigationUi(0);
  }

  function clearNavigation({quiet=false}={}) {
    disposeNavigationVisual();
    navigation=makeEmptyNavigation();
    clearActiveDestination();
    els.navBanner.classList.remove('show','rerouting');
    els.routingCredit.textContent='';
    els.placeEyebrow.textContent='DRIVING AROUND';
    els.locationName.textContent=currentLocationName;
    if(!quiet)showToast('Navigation ended');
  }

  function disposeNavigationVisual() {
    const group=navigation?.routeGroup;
    if(!group)return;
    scene?.remove(group);
    group.traverse(obj=>{
      obj.geometry?.dispose?.();
      const mats=Array.isArray(obj.material)?obj.material:(obj.material?[obj.material]:[]);
      mats.forEach(mat=>{
        if(![shared.routeUnder,shared.route,shared.routeArrow,shared.destination].includes(mat))mat.dispose?.();
      });
    });
    navigation.routeGroup=null;
  }

  function elevateRouteWorldPoints(points){
    return points.map(p=>{
      const hit=nearestRoadHitInSegments(p.x,p.z,roadSegments);
      return {...p,y:hit&&hit.dist<20?segmentYAt(hit.seg,hit.t):0};
    });
  }

  function renderNavigationWorld() {
    disposeNavigationVisual();
    const group=new THREE.Group();
    navigation.routeGroup=group;
    if(navigation.routeWorld.length>1){
      const under=[],line=[],routePoints=elevateRouteWorldPoints(navigation.routeWorld);
      appendRoadRibbon(under,routePoints,3.4,.078,false);
      appendRoadRibbon(line,routePoints,1.75,.104,false);
      if(under.length){const m=meshFromFlatVertices(under,shared.routeUnder,false);m.renderOrder=8;group.add(m);}
      if(line.length){const m=meshFromFlatVertices(line,shared.route,false);m.renderOrder=9;group.add(m);}
      addRouteChevrons(group,routePoints);
    }
    addDestinationMarkerTo(group);
    scene.add(group);
  }

  function renderDestinationMarker() {
    disposeNavigationVisual();
    const group=new THREE.Group();
    navigation.routeGroup=group;
    addDestinationMarkerTo(group);
    scene.add(group);
  }

  function addDestinationMarkerTo(group) {
    if(!navigation.destination)return;
    const p=project(navigation.destination.lat,navigation.destination.lon),hit=nearestRoadHitInSegments(p.x,p.z,roadSegments),baseY=hit&&hit.dist<28?segmentYAt(hit.seg,hit.t):0;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(3.8,.28,6,30),shared.destination);
    ring.position.set(p.x,baseY+.18,p.z);ring.rotation.x=Math.PI/2;ring.renderOrder=11;group.add(ring);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,16,8,1,true),shared.destination);
    beam.position.set(p.x,baseY+8,p.z);beam.renderOrder=10;group.add(beam);
  }

  function addRouteChevrons(group,points) {
    if(points.length<2)return;
    const verts=[];
    let walked=0,nextAt=55,count=0;
    for(let i=0;i<points.length-1&&count<80;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<.1)continue;
      while(walked+len>=nextAt&&count<80){
        const t=(nextAt-walked)/len,x=a.x+dx*t,z=a.z+dz*t,ux=dx/len,uz=dz/len,nx=-uz,nz=ux,y=((a.y||0)+((b.y||0)-(a.y||0))*t)+.118;
        const tip=[x+ux*2.4,y,z+uz*2.4],left=[x-ux*1.4+nx*1.25,y,z-uz*1.4+nz*1.25],right=[x-ux*1.4-nx*1.25,y,z-uz*1.4-nz*1.25];
        pushTri(verts,tip,left,right);nextAt+=70;count++;
      }
      walked+=len;
    }
    if(verts.length){const mesh=meshFromFlatVertices(verts,shared.routeArrow,false);mesh.renderOrder=10;group.add(mesh);}
  }

  function updateNavigation(elapsed) {
    if(!navigation.active||!navigation.destination)return;
    if(elapsed-lastNavUpdate<NAV_UPDATE_SECONDS)return;
    lastNavUpdate=elapsed;
    const carCoords=currentCarCoords();
    const directToDest=haversineMeters(carCoords.lat,carCoords.lon,navigation.destination.lat,navigation.destination.lon);

    if(directToDest<ARRIVAL_METERS){
      arriveAtDestination();
      return;
    }

    if(navigation.mode==='route'&&navigation.routeWorld.length>1){
      const hit=routeProgressForPoint(car.position.x,car.position.z,false);
      navigation.nearestDistance=hit.distance;
      navigation.nearestIndex=hit.index;
      navigation.progressM=Math.max(navigation.progressM,hit.progressM-12);
      navigation.remainingM=Math.max(0,navigation.totalM-navigation.progressM);
      const ratio=navigation.totalM>0?navigation.remainingM/navigation.totalM:0;
      navigation.remainingS=Math.max(0,navigation.durationS*ratio);

      if(hit.distance>ROUTE_OFFTRACK_METERS&&!navigation.fetching&&elapsed-navigation.lastRerouteAt>ROUTE_REROUTE_COOLDOWN){
        navigation.lastRerouteAt=elapsed;
        requestNavigationRoute(carCoords,navigation.destination,{reroute:true,quiet:true});
      }
    }else{
      navigation.remainingM=directToDest;
      navigation.remainingS=0;
    }
    updateNavigationUi(directToDest);
  }

  function updateNavigationUi(directToDest=0) {
    if(!navigation.active||!navigation.destination)return;
    els.navBanner.classList.add('show');
    els.navDestinationName.textContent=navigation.destination.name;
    els.placeEyebrow.textContent='NAVIGATING TO';
    els.locationName.textContent=navigation.destination.name;

    if(navigation.mode==='route'){
      const next=navigation.steps.find(step=>step.progressM>navigation.progressM+5);
      const distToTurn=next?Math.max(0,next.progressM-navigation.progressM):navigation.remainingM;
      const instruction=next?instructionForStep(next):`Continue to ${navigation.destination.name}`;
      const glyph=next?maneuverGlyph(next):'↑';
      els.navArrow.textContent=glyph;
      els.navArrow.style.transform='none';
      els.navInstruction.textContent=instruction;
      els.navTurnDistance.textContent=formatDistance(distToTurn);
      els.navRemaining.textContent=formatDistance(navigation.remainingM);
      els.navEta.textContent=navigation.remainingS?formatEta(navigation.remainingS):'';
      els.miniMapFooter.textContent=`${formatDistance(navigation.remainingM)} · ${navigation.destination.name}`;
    }else{
      const here=currentCarCoords();
      const bearing=bearingDegrees(here.lat,here.lon,navigation.destination.lat,navigation.destination.lon);
      const heading=headingDegreesFromYaw(car.rotation.y);
      const relative=((bearing-heading+540)%360)-180;
      els.navArrow.textContent='↑';
      els.navArrow.style.transform=`rotate(${relative}deg)`;
      els.navInstruction.textContent=`Head toward ${navigation.destination.name}`;
      els.navTurnDistance.textContent=formatDistance(navigation.remainingM||directToDest);
      els.navRemaining.textContent=formatDistance(navigation.remainingM||directToDest);
      els.navEta.textContent='COMPASS';
      els.miniMapFooter.textContent=`${formatDistance(navigation.remainingM||directToDest)} · ${navigation.destination.name}`;
    }
  }

  function arriveAtDestination() {
    if(navigation.arrived)return;
    navigation.arrived=true;
    navigation.active=false;
    currentLocationName=navigation.destination.name;
    savePlace({name:currentLocationName,subtitle:'Last destination',lat:navigation.destination.lat,lon:navigation.destination.lon});
    clearActiveDestination();
    speedMps*=.65;
    els.navArrow.textContent='✓';
    els.navArrow.style.transform='none';
    els.navInstruction.textContent=`Arrived at ${navigation.destination.name}`;
    els.navTurnDistance.textContent='';
    els.navRemaining.textContent='ARRIVED';
    els.navEta.textContent='';
    els.placeEyebrow.textContent='ARRIVED';
    setTimeout(()=>{if(navigation.arrived)clearNavigation({quiet:true});},5000);
    showToast(`Arrived at ${navigation.destination.name}`);
  }

  function routeProgressForPoint(x,z,forceFull=false) {
    const pts=navigation.routeWorld;
    if(pts.length<2)return {distance:Infinity,progressM:0,index:0};
    let start=0,end=pts.length-2;
    if(!forceFull&&Number.isFinite(navigation.nearestIndex)){
      start=Math.max(0,navigation.nearestIndex-70);
      end=Math.min(pts.length-2,navigation.nearestIndex+120);
    }
    let best={distance:Infinity,progressM:0,index:0};
    for(let i=start;i<=end;i++){
      const a=pts[i],b=pts[i+1],vx=b.x-a.x,vz=b.z-a.z,len2=vx*vx+vz*vz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*vx+(z-a.z)*vz)/len2));
      const px=a.x+t*vx,pz=a.z+t*vz,d=Math.hypot(x-px,z-pz);
      if(d<best.distance){
        const c0=navigation.cumulativeM[i]||0,c1=navigation.cumulativeM[i+1]??c0;
        best={distance:d,progressM:c0+(c1-c0)*t,index:i};
      }
    }
    if(!forceFull&&best.distance>120){
      navigation.nearestIndex=0;
      return routeProgressForPoint(x,z,true);
    }
    return best;
  }

  function instructionForStep(step) {
    const name=step.name?` ${step.name}`:'';
    const mod=String(step.modifier||'straight').replace('_',' ');
    if(step.type==='arrive')return 'Arrive at your destination';
    if(step.type==='depart')return `Start ${mod}${name?` on${name}`:''}`;
    if(step.type==='roundabout'||step.type==='rotary')return step.exit?`At the roundabout, take exit ${step.exit}${name?` onto${name}`:''}`:`Enter the roundabout${name?` toward${name}`:''}`;
    if(step.type==='merge')return `Merge ${mod}${name?` onto${name}`:''}`;
    if(step.type==='on ramp'||step.type==='off ramp')return `Take the ${mod} ramp${name?` onto${name}`:''}`;
    if(step.type==='fork')return `Keep ${mod}${name?` onto${name}`:''}`;
    if(step.type==='turn')return `Turn ${mod}${name?` onto${name}`:''}`;
    if(step.type==='new name')return `Continue${name?` onto${name}`:''}`;
    if(step.type==='end of road')return `At the end, turn ${mod}${name?` onto${name}`:''}`;
    return `Continue ${mod}${name?` on${name}`:''}`.replace('Continue straight on','Continue on');
  }

  function maneuverGlyph(step) {
    const type=step.type||'',mod=step.modifier||'straight';
    if(type==='arrive')return '✓';
    if(type==='roundabout'||type==='rotary')return '⟳';
    if(/u-?turn/.test(mod))return '↶';
    if(/sharp right/.test(mod))return '↘';
    if(/slight right/.test(mod))return '↗';
    if(/right/.test(mod))return '→';
    if(/sharp left/.test(mod))return '↙';
    if(/slight left/.test(mod))return '↖';
    if(/left/.test(mod))return '←';
    return '↑';
  }

  function haversineMeters(lat1,lon1,lat2,lon2) {
    const R=6371000,toRad=Math.PI/180;
    const p1=lat1*toRad,p2=lat2*toRad,dLat=(lat2-lat1)*toRad,dLon=(lon2-lon1)*toRad;
    const a=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function bearingDegrees(lat1,lon1,lat2,lon2) {
    const r=Math.PI/180,p1=lat1*r,p2=lat2*r,dLon=(lon2-lon1)*r;
    const y=Math.sin(dLon)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dLon);
    return (Math.atan2(y,x)*180/Math.PI+360)%360;
  }

  function formatDistance(meters) {
    const m=Math.max(0,Number(meters)||0);
    if(m<1000)return m<100?`${Math.round(m/10)*10} m`:`${Math.round(m/50)*50} m`;
    return `${(m/1000).toFixed(m<10000?1:0)} km`;
  }

  function formatEta(seconds) {
    const s=Math.max(0,Number(seconds)||0),mins=Math.max(1,Math.round(s/60));
    if(mins<60)return `${mins} min`;
    const h=Math.floor(mins/60),m=mins%60;
    return m?`${h} h ${m} min`:`${h} h`;
  }


  function setPlaceMode(mode) {
    placeMode=mode==='start'?'start':'navigate';
    const nav=placeMode==='navigate';
    els.navigateModeBtn.classList.toggle('active',nav);
    els.startModeBtn.classList.toggle('active',!nav);
    els.panelTitle.textContent=nav?'Where do you want to go?':'Where do you want to start?';
    els.panelIntro.textContent=nav
      ?`You are driving around ${currentLocationName}. Pick a destination and DriveSG will guide you there; “Start here” teleports to a new starting area.`
      :'Choose a Singapore area to spawn on a nearby real road. Any active navigation will end.';
    els.searchInput.placeholder=nav?'Search destination, e.g. Bugis':'Search starting area, e.g. Bishan';
    els.randomBtnLabel.textContent=nav?'Random destination':'Random start';
  }

  function handlePlaceChoice(place) {
    if(placeMode==='navigate')navigateTo(place);
    else{
      clearNavigation({quiet:true});
      loadLocation(place);
    }
  }

  function saveActiveDestination(place) {
    try{localStorage.setItem('drivesg-active-destination',JSON.stringify({...place,savedAt:Date.now()}));}catch(_){}
  }

  function readActiveDestination() {
    try{
      const p=JSON.parse(localStorage.getItem('drivesg-active-destination')||'null');
      if(!p||Date.now()-Number(p.savedAt||0)>3*60*60*1000||!insideSingapore(Number(p.lat),Number(p.lon))){clearActiveDestination();return null;}
      return p;
    }catch(_){return null;}
  }

  function clearActiveDestination(){try{localStorage.removeItem('drivesg-active-destination');}catch(_){}}

  function saveRecentDestination(place) {
    try{
      const current=readRecentDestinations().filter(p=>Math.hypot(p.lat-place.lat,p.lon-place.lon)>.00015);
      current.unshift({name:place.name,subtitle:place.subtitle||'',lat:Number(place.lat),lon:Number(place.lon)});
      localStorage.setItem('drivesg-recent-destinations',JSON.stringify(current.slice(0,4)));
    }catch(_){}
  }

  function readRecentDestinations() {
    try{
      const a=JSON.parse(localStorage.getItem('drivesg-recent-destinations')||'[]');
      return Array.isArray(a)?a.filter(p=>p&&insideSingapore(Number(p.lat),Number(p.lon))).slice(0,4):[];
    }catch(_){return [];}
  }

  function buildRecentDestinations() {
    if(!els.recentGrid||!els.recentSection)return;
    const recent=readRecentDestinations();
    els.recentGrid.innerHTML='';
    els.recentSection.classList.toggle('hidden',!recent.length);
    recent.forEach(place=>{
      const btn=document.createElement('button');btn.type='button';btn.textContent=place.name;
      btn.addEventListener('click',()=>{setPlaceMode('navigate');navigateTo(place);});
      els.recentGrid.appendChild(btn);
    });
  }

  function ensureMiniMapResolution() {
    const c=els.miniMapCanvas;if(!c)return;
    const rect=c.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(240,Math.round(rect.width*ratio)),h=Math.max(180,Math.round(rect.height*ratio));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  }

  function paintMiniMap(elapsed) {
    if(!els.miniMapCanvas||!car||elapsed-lastMiniMapPaint<.11)return;
    lastMiniMapPaint=elapsed;
    ensureMiniMapResolution();
    const c=els.miniMapCanvas,ctx=c.getContext('2d');if(!ctx)return;
    const w=c.width,h=c.height,cx=w/2,cy=h*.53;
    const yaw=car.rotation.y,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
    let mapCenterX=car.position.x,mapCenterZ=car.position.z;
    let range=navigation.active?THREE.MathUtils.clamp(Math.max(260,Math.min(470,navigation.remainingM*.16)),260,470):MINI_MAP_RANGE_DEFAULT;
    let scale=Math.min(w,h)/(range*2);
    let overviewNorthUp=false;
    if(miniMapExpanded&&navigation.active&&navigation.routeWorld.length>1){
      const pts=[...navigation.routeWorld,{x:car.position.x,z:car.position.z}];
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
      mapCenterX=(minX+maxX)/2;mapCenterZ=(minZ+maxZ)/2;
      const spanX=Math.max(220,maxX-minX),spanZ=Math.max(220,maxZ-minZ);
      scale=Math.min(w/(spanX*1.18),h/(spanZ*1.18));
      range=Math.max(spanX,spanZ)*.62;overviewNorthUp=true;
    }
    const toScreen=(x,z)=>{
      const dx=x-mapCenterX,dz=z-mapCenterZ;
      if(miniMapHeadingUp&&!overviewNorthUp)return {x:cx+(dx*rx+dz*rz)*scale,y:cy-(dx*fx+dz*fz)*scale};
      return {x:cx+dx*scale,y:cy+dz*scale};
    };
    const near=(x,z,pad=1.25)=>Math.abs(x-mapCenterX)<range*pad&&Math.abs(z-mapCenterZ)<range*pad;

    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#142126';ctx.fillRect(0,0,w,h);

    const drawPoly=(pts,fill)=>{
      if(!pts?.length)return;
      const center=pts.reduce((a,p)=>({x:a.x+p.x/pts.length,z:a.z+p.z/pts.length}),{x:0,z:0});
      if(!near(center.x,center.z,1.5))return;
      ctx.beginPath();pts.forEach((p,i)=>{const q=toScreen(p.x,p.z);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    };
    for(const pts of currentParkPolygons)drawPoly(pts,'#31463b');
    for(const pts of currentWaterPolygons)drawPoly(pts,'#264856');

    let buildingDrawn=0;
    for(const b of buildingColliders){
      if(buildingDrawn>260)break;
      if(!near(b.x,b.z,1.15))continue;
      drawPoly(b.pts,'#566167');buildingDrawn++;
    }

    ctx.lineCap='round';
    for(const seg of roadSegments){
      const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2;if(!near(mx,mz,1.25))continue;
      const a=toScreen(seg.ax,seg.az),b=toScreen(seg.bx,seg.bz);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      ctx.strokeStyle=seg.tunnel?'#586267':(seg.bridge?'#c4ccc8':(seg.major?'#a0aaa8':'#7d8988'));ctx.lineWidth=Math.max(1.2,Math.min(5.5,seg.width*scale*.82));ctx.stroke();
    }

    const signalPhase=trafficSignalPhase(elapsed),signalColor=signalPhase==='red'?'#ff776f':(signalPhase==='amber'?'#ffd36b':'#75e696');
    for(const sig of trafficSignalsWorld){if(!near(sig.x,sig.z))continue;const q=toScreen(sig.x,sig.z);ctx.beginPath();ctx.arc(q.x,q.y,2.3,0,Math.PI*2);ctx.fillStyle=signalColor;ctx.fill();}
    for(const incident of liveTrafficIncidents){
      const p=project(Number(incident.latitude),Number(incident.longitude));if(!near(p.x,p.z))continue;const q=toScreen(p.x,p.z);
      ctx.beginPath();ctx.arc(q.x,q.y,4.2,0,Math.PI*2);ctx.fillStyle='#ff6b5f';ctx.fill();ctx.strokeStyle='#531d18';ctx.lineWidth=1.4;ctx.stroke();
    }

    if(navigation.active&&navigation.routeWorld.length>1){
      ctx.beginPath();let begun=false;
      for(const p of navigation.routeWorld){
        if(!near(p.x,p.z,1.7)&&begun)continue;
        const q=toScreen(p.x,p.z);if(!begun){ctx.moveTo(q.x,q.y);begun=true;}else ctx.lineTo(q.x,q.y);
      }
      ctx.strokeStyle='#72e7c6';ctx.lineWidth=Math.max(3,4.5*scale);ctx.shadowColor='rgba(114,231,198,.45)';ctx.shadowBlur=7;ctx.stroke();ctx.shadowBlur=0;
    }

    for(const agent of ambientTraffic){
      if(!near(agent.x,agent.z))continue;const q=toScreen(agent.x,agent.z);
      ctx.fillStyle='#d8c36b';ctx.fillRect(q.x-1.5,q.y-2.5,3,5);
    }

    if(navigation.active&&navigation.destination){
      const d=project(navigation.destination.lat,navigation.destination.lon);
      const dx=d.x-car.position.x,dz=d.z-car.position.z,dist=Math.hypot(dx,dz);
      if(overviewNorthUp||dist<range*.88){
        const q=toScreen(d.x,d.z);ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fillStyle='#7af0ca';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#0b1716';ctx.stroke();
      }else{
        let right,forward;
        if(miniMapHeadingUp&&!overviewNorthUp){right=dx*rx+dz*rz;forward=dx*fx+dz*fz;}
        else{right=dx;forward=-dz;}
        const angle=Math.atan2(right,forward),r=Math.min(w,h)*.37;
        const qx=cx+Math.sin(angle)*r,qy=cy-Math.cos(angle)*r;
        ctx.save();ctx.translate(qx,qy);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,6);ctx.lineTo(-6,6);ctx.closePath();ctx.fillStyle='#7af0ca';ctx.fill();ctx.restore();
      }
    }

    const carMapPos=overviewNorthUp?toScreen(car.position.x,car.position.z):{x:cx,y:cy};
    ctx.save();ctx.translate(carMapPos.x,carMapPos.y);
    if(!miniMapHeadingUp||overviewNorthUp)ctx.rotate(headingDegreesFromYaw(yaw)*Math.PI/180);
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fillStyle='#ffffff';ctx.fill();ctx.strokeStyle='#0c1518';ctx.lineWidth=2;ctx.stroke();ctx.restore();

    els.compassLabel.textContent=overviewNorthUp?'ROUTE · NORTH':(miniMapHeadingUp?headingCardinal(yaw):'NORTH');
    if(!navigation.active)els.miniMapFooter.textContent=lastRoadLabel||currentLocationName;
  }

  function toggleMiniMapExpanded(){
    miniMapExpanded=!miniMapExpanded;
    els.miniMapCard.classList.toggle('expanded',miniMapExpanded);
    document.body.classList.toggle('map-expanded',miniMapExpanded);
    els.mapExpandBtn.textContent=miniMapExpanded?'×':'⛶';
    els.mapExpandBtn.setAttribute('aria-label',miniMapExpanded?'Close route map':'Expand route map');
    clearInputs();
    lastMiniMapPaint=-Infinity;
  }

  function headingDegreesFromYaw(yaw) {
    const east=Math.sin(yaw),north=-Math.cos(yaw);
    return (Math.atan2(east,north)*180/Math.PI+360)%360;
  }

  function headingCardinal(yaw) {
    const deg=headingDegreesFromYaw(yaw);
    const dirs=['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(deg/45)%8];
  }

  function trafficDensityForTime(){
    const h=singaporeClockHour();
    if(h>=7&&h<9.8)return 1.28;
    if(h>=16.8&&h<20.2)return 1.36;
    if(h>=0&&h<5.5)return .48;
    if(h>=22.5)return .66;
    return .90;
  }

  function trafficSpeedFactorForTime(){
    const h=singaporeClockHour();
    if(h>=7&&h<9.8)return .78;
    if(h>=16.8&&h<20.2)return .72;
    if(h>=0&&h<5.5)return 1.06;
    return .94;
  }

  function createAmbientTraffic(group,segments,graph=roadGraph) {
    ambientTraffic=[];trafficMesh=null;
    const eligible=segments.filter(s=>Math.hypot(s.bx-s.ax,s.bz-s.az)>22&&!/service|living_street/.test(s.type||''));
    if(!eligible.length||!group)return;
    const count=Math.min(MAX_AMBIENT_TRAFFIC,Math.max(5,Math.floor(Math.max(9,eligible.length/22)*trafficDensityForTime())));
    const geo=new THREE.BoxGeometry(1.68,.68,3.65);
    trafficMesh=new THREE.InstancedMesh(geo,trafficMaterial,count);
    trafficMesh.castShadow=false;trafficMesh.receiveShadow=false;
    const palette=[0x263238,0xd6d9d6,0x7d292c,0x244a62,0xb7a56b,0xeeeeea,0x7b8790];
    for(let i=0;i<count;i++){
      const seg=eligible[Math.floor(pseudoRandom(i*41+13)*eligible.length)];
      const dirs=[1,-1].filter(d=>trafficCanTraverse(seg,d)),dir=dirs[Math.floor(pseudoRandom(i*17+4)*dirs.length)]||1;
      const type=pseudoRandom(i*71+9)>.86?'bus':'car';
      ambientTraffic.push({seg,t:dir>0?pseudoRandom(i*23+7):1-pseudoRandom(i*23+7),dir,type,cruise:trafficCruiseFor(seg,i),speed:0,x:0,z:0,y:seg.y||0});
      trafficMesh.setColorAt(i,new THREE.Color(type==='bus'?0xe7e4db:palette[i%palette.length]));
    }
    trafficMesh.instanceColor.needsUpdate=true;group.add(trafficMesh);updateAmbientTraffic(0,0);
  }

  function trafficCruiseFor(seg,seed=1){
    const limit=seg.speedLimit?seg.speedLimit/3.6:null;
    let base=/motorway|trunk/.test(seg.type||'')?19:/primary|secondary/.test(seg.type||'')?13:9;
    base*=.86+pseudoRandom(seed*29+11)*.30;
    if(Number.isFinite(seg.liveTrafficKmh)&&seg.liveTrafficKmh>0)base=Math.min(base,Math.max(2.2,seg.liveTrafficKmh/3.6*.96));
    return limit?Math.min(base,Math.max(5,limit*.92)):base;
  }

  function chooseNextTrafficLeg(agent){
    const seg=agent.seg,exitKey=agent.dir>0?seg.toKey:seg.fromKey;
    let candidates=(roadGraph.get(exitKey)||[]).filter(e=>trafficCanTraverse(e.seg,e.dir));
    if(candidates.length>1)candidates=candidates.filter(e=>e.seg!==seg);
    if(!candidates.length)return null;
    const cdx=(seg.bx-seg.ax)*agent.dir,cdz=(seg.bz-seg.az)*agent.dir,cl=Math.hypot(cdx,cdz)||1,cux=cdx/cl,cuz=cdz/cl;
    let best=null,bestScore=-Infinity;
    candidates.forEach((e,idx)=>{
      const ndx=(e.seg.bx-e.seg.ax)*e.dir,ndz=(e.seg.bz-e.seg.az)*e.dir,nl=Math.hypot(ndx,ndz)||1,dot=(cux*ndx+cuz*ndz)/nl;
      const score=dot*1.35+(e.seg.major===seg.major?0.18:0)+pseudoRandom((e.seg.ax+e.seg.az+idx*17)*3)*.72;
      if(score>bestScore){bestScore=score;best=e;}
    });
    return best;
  }

  function respawnTrafficAgent(agent,index){
    const eligible=roadSegments.filter(s=>Math.hypot(s.bx-s.ax,s.bz-s.az)>24&&!/service|living_street/.test(s.type||''));if(!eligible.length)return;
    const seg=eligible[Math.floor(pseudoRandom((clock?.elapsedTime||0)*13+index*47+5)*eligible.length)],dirs=[1,-1].filter(d=>trafficCanTraverse(seg,d));
    agent.seg=seg;agent.dir=dirs[Math.floor(pseudoRandom(index*23+9)*dirs.length)]||1;agent.t=agent.dir>0?0:1;agent.cruise=trafficCruiseFor(seg,index+31);agent.speed=agent.cruise*.55;
  }

  function trafficSignalPhase(elapsed){const t=((elapsed||0)%22+22)%22;return t<8?'red':(t<19?'green':'amber');}
  function trafficSignalIsRed(elapsed){return trafficSignalPhase(elapsed)==='red';}

  function signalDistanceAhead(agent){
    const list=agent.seg.signals||[];if(!list.length)return Infinity;
    const len=Math.hypot(agent.seg.bx-agent.seg.ax,agent.seg.bz-agent.seg.az)||1;let best=Infinity;
    for(const s of list){const dt=(s.t-agent.t)*agent.dir;if(dt>0)best=Math.min(best,dt*len);}
    return best;
  }

  function updateAmbientTraffic(dt,elapsed=clock?.elapsedTime||0) {
    if(!trafficMesh||!ambientTraffic.length)return;
    const red=trafficSignalIsRed(elapsed),m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    ambientTraffic.forEach((a,i)=>{
      let seg=a.seg,dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1;
      let target=a.cruise*trafficSpeedFactorForTime()*(1-wetness*.16);
      const sigDist=red?signalDistanceAhead(a):Infinity;
      if(sigDist<16)target=Math.min(target,Math.max(0,(sigDist-3.2)*.72));
      for(const other of ambientTraffic){
        if(other===a||other.seg!==seg||other.dir!==a.dir)continue;
        const ahead=(other.t-a.t)*a.dir*len;if(ahead>0&&ahead<13){target=Math.min(target,Math.max(0,(ahead-4)*.85));break;}
      }
      a.speed+=(target-a.speed)*Math.min(1,dt*(target<a.speed?3.8:1.3));
      if(dt>0)a.t+=a.dir*(a.speed/len)*dt;
      if(a.t>1||a.t<0){
        const next=chooseNextTrafficLeg(a);
        if(next){a.seg=seg=next.seg;a.dir=next.dir;a.t=a.dir>0?0:1;a.cruise=trafficCruiseFor(seg,i+Math.floor(elapsed));}
        else{respawnTrafficAgent(a,i);seg=a.seg;}
        dx=seg.bx-seg.ax;dz=seg.bz-seg.az;len=Math.hypot(dx,dz)||1;
      }
      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
      const laneOffset=Math.min(2.45,Math.max(.78,seg.width*Math.min(.24,.45/Math.max(1,seg.lanes))))*a.dir;
      a.x=seg.ax+dx*a.t+nx*laneOffset;a.z=seg.az+dz*a.t+nz*laneOffset;a.y=segmentYAt(seg,a.t);
      const yaw=Math.atan2(dx*a.dir,dz*a.dir);
      pos.set(a.x,a.y+(a.type==='bus'?.70:.43),a.z);quat.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
      scale.set(a.type==='bus'?1.08:1,a.type==='bus'?1.65:1,a.type==='bus'?1.75:1);m.compose(pos,quat,scale);trafficMesh.setMatrixAt(i,m);
    });
    trafficMesh.instanceMatrix.needsUpdate=true;
  }

  function carHitsTraffic(x,z,y=carRoadY) {
    for(const a of ambientTraffic)if(Math.abs((a.y||0)-y)<1.8&&Math.hypot(x-a.x,z-a.z)<2.25)return true;
    return false;
  }

  function singaporeClockHour(){
    try{
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
      const h=Number(parts.find(p=>p.type==='hour')?.value),m=Number(parts.find(p=>p.type==='minute')?.value);
      return (Number.isFinite(h)?h:13)+(Number.isFinite(m)?m:0)/60;
    }catch(_){return new Date().getHours()+new Date().getMinutes()/60;}
  }

  function lightingTarget(){
    if(lightingMode==='day')return {night:0,hour:13};
    if(lightingMode==='dusk')return {night:.54,hour:18.8};
    if(lightingMode==='night')return {night:1,hour:22};
    const h=singaporeClockHour();let night=1;
    if(h>=7&&h<=18.45)night=0;
    else if(h>18.45&&h<19.45)night=THREE.MathUtils.clamp((h-18.45)/1,0,1);
    else if(h>6&&h<7)night=1-THREE.MathUtils.clamp((h-6)/1,0,1);
    return {night,hour:h};
  }

  function updateLightingButton(){
    if(!els.lightingBtn)return;
    const icon={auto:'◐',day:'☀',dusk:'◒',night:'☾'}[lightingMode]||'◐';
    const label={auto:'Auto',day:'Day',dusk:'Dusk',night:'Night'}[lightingMode]||'Auto';
    els.lightingBtn.textContent=icon;els.lightingBtn.title=`Lighting: ${label}`;els.lightingBtn.setAttribute('aria-label',`Lighting mode: ${label}`);
  }

  function cycleLightingMode(){
    const modes=['auto','day','dusk','night'],i=modes.indexOf(lightingMode);lightingMode=modes[(i+1)%modes.length];
    try{localStorage.setItem('drivesg-lighting-mode',lightingMode);}catch(_){}
    updateLightingButton();lastLightingUpdate=-Infinity;showToast(`Lighting · ${lightingMode==='auto'?'Singapore time':lightingMode}`);
  }

  function updateWorldLighting(dt,elapsed){
    if(elapsed-lastLightingUpdate>.18||lastLightingUpdate<0){
      lastLightingUpdate=elapsed;
      const target=lightingTarget();lightingSunHour=target.hour;
      lightingNightFactor+=(target.night-lightingNightFactor)*Math.min(1,Math.max(.08,dt*3.2));
      const n=lightingNightFactor;
      const day=new THREE.Color(0xa9c5cf),dusk=new THREE.Color(0x7a7181),night=new THREE.Color(0x07131d),sky=new THREE.Color();
      if(n<.56)sky.lerpColors(day,dusk,n/.56);else sky.lerpColors(dusk,night,(n-.56)/.44);
      const cloud=THREE.MathUtils.clamp((Number(environmentState.cloudPct)||0)/100,0,1),rainDim=/rain/.test(environmentState.condition||'')?.22:0;
      sky.lerp(new THREE.Color(0x67767c),Math.max(0,cloud-.35)*.34+rainDim);
      scene.background.copy(sky);if(scene.fog){scene.fog.color.copy(sky);scene.fog.density=THREE.MathUtils.lerp(.00125,.00158,n)+wetness*.00046;}
      if(horizonHaze){horizonHaze.material.color.copy(sky.clone().lerp(new THREE.Color(0x6a7c83),.28));horizonHaze.material.opacity=THREE.MathUtils.lerp(.22,.12,n)+wetness*.07;}
      if(hemi)hemi.intensity=THREE.MathUtils.lerp(2.35,.58,n)*(1-cloud*.22-rainDim);
      if(sun){sun.intensity=THREE.MathUtils.lerp(2.25,.15,n)*(1-cloud*.52-rainDim);sun.color.set(n>.32?0xffb56b:0xffeed0);}
      if(shared.windows)shared.windows.emissiveIntensity=THREE.MathUtils.lerp(.06,1.65,n);
      if(shared.storefront)shared.storefront.emissiveIntensity=THREE.MathUtils.lerp(.10,1.28,n);
      if(shared.streetLamp)shared.streetLamp.emissiveIntensity=THREE.MathUtils.lerp(.08,4.6,n);
      if(carHeadlight)carHeadlight.intensity=n>.35?THREE.MathUtils.lerp(0,34,(n-.35)/.65):0;
      if(renderer)renderer.toneMappingExposure=THREE.MathUtils.lerp(1.08,.91,n);
    }
  }

  function updateSignalVisual(elapsed){
    const phase=trafficSignalPhase(elapsed),nightBoost=1+lightingNightFactor*.75;
    if(shared.signalRed)shared.signalRed.emissiveIntensity=(phase==='red'?2.8:.10)*nightBoost;
    if(shared.signalAmber)shared.signalAmber.emissiveIntensity=(phase==='amber'?2.4:.08)*nightBoost;
    if(shared.signalGreen)shared.signalGreen.emissiveIntensity=(phase==='green'?2.3:.08)*nightBoost;
  }

  function registerServiceWorker(){
    // Four-file GitHub Pages deployment intentionally has no service worker.
    // Backend caching avoids extra stale-bundle risk on iPhone Safari.
  }

  function createRainSystem(){
    const count=760;
    const positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      positions[i*3]=(pseudoRandom(i*17+1)-.5)*72;
      positions[i*3+1]=6+pseudoRandom(i*29+3)*34;
      positions[i*3+2]=(pseudoRandom(i*41+7)-.5)*88;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const mat=new THREE.PointsMaterial({color:0xbfd8e7,size:.09,transparent:true,opacity:.0,depthWrite:false,sizeAttenuation:true});
    rainPoints=new THREE.Points(geo,mat);rainPoints.visible=false;rainPositions=positions;scene.add(rainPoints);
  }

  function weatherIconFor(condition){
    return {'heavy-rain':'☔','rain':'☂','cloudy':'☁','partly-cloudy':'◒','clear':'☀'}[condition]||'◐';
  }

  function updateWeatherBadge(){
    if(!els.weatherBadge)return;
    const c=environmentState.condition||'clear',temp=Number(environmentState.temperatureC);
    els.weatherBadge.classList.add('show');
    els.weatherBadge.classList.toggle('rainy',/rain/.test(c));
    els.weatherIcon.textContent=weatherIconFor(c);
    const label=c==='heavy-rain'?'Heavy rain':c==='rain'?'Rain':c==='partly-cloudy'?'Partly cloudy':c==='cloudy'?'Cloudy':'Clear';
    els.weatherText.textContent=Number.isFinite(temp)?`${label} · ${Math.round(temp)}°C`:label;
  }

  async function refreshEnvironment(){
    if(environmentBusy||!car)return;environmentBusy=true;
    const c=currentCarCoords();
    try{
      let data=null;
      if(BACKEND_ACTIVE){
        const res=await fetch(`${BACKEND_BASE}/api/environment?lat=${encodeURIComponent(c.lat)}&lon=${encodeURIComponent(c.lon)}`,{headers:{Accept:'application/json'}});if(res.ok)data=await res.json();
      }
      if(!data){
        const url=`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m&timezone=Asia%2FSingapore&forecast_days=1`;
        const res=await fetch(url,{headers:{Accept:'application/json'}});if(res.ok){const raw=await res.json(),x=raw?.current||{},p=Number(x.precipitation??x.rain??0)||0,code=Number(x.weather_code)||0;data={condition:p>=7||[65,67,82,95,96,99].includes(code)?'heavy-rain':(p>.1||[51,53,55,56,57,61,63,66,80,81].includes(code)?'rain':([1,2].includes(code)?'partly-cloudy':(code===3||[45,48].includes(code)?'cloudy':'clear'))),precipitationMm:p,cloudPct:Number(x.cloud_cover),temperatureC:Number(x.temperature_2m),humidityPct:Number(x.relative_humidity_2m),windKmh:Number(x.wind_speed_10m),provider:'Open-Meteo'};}
      }
      if(data){environmentState={...environmentState,...data};updateWeatherBadge();}
    }catch(err){console.warn('Environment refresh failed',err?.message||err);}
    finally{environmentBusy=false;}
  }

  function maybeRefreshEnvironment(elapsed){
    if(lastEnvironmentRefresh>=0&&elapsed-lastEnvironmentRefresh<ENVIRONMENT_REFRESH_SECONDS)return;
    lastEnvironmentRefresh=elapsed;refreshEnvironment();
  }

  function updateWeatherEffects(dt){
    const rainTarget=environmentState.condition==='heavy-rain'?1:(environmentState.condition==='rain'?.58:0);
    wetness+=(rainTarget-wetness)*Math.min(1,dt*(rainTarget>wetness?1.25:.18));
    if(shared.road){shared.road.roughness=THREE.MathUtils.lerp(.96,.46,wetness);shared.road.metalness=THREE.MathUtils.lerp(0,.08,wetness);}
    if(shared.majorRoad){shared.majorRoad.roughness=THREE.MathUtils.lerp(.95,.43,wetness);shared.majorRoad.metalness=THREE.MathUtils.lerp(0,.09,wetness);}
    if(shared.roadEdge)shared.roadEdge.roughness=THREE.MathUtils.lerp(1,.72,wetness);
    if(rainPoints&&rainPositions){
      rainPoints.visible=wetness>.05;rainPoints.material.opacity=THREE.MathUtils.lerp(0,.72,wetness);rainPoints.position.set(car.position.x,carRoadY,car.position.z);
      if(rainPoints.visible){
        const fall=(24+wetness*34)*dt;
        for(let i=0;i<rainPositions.length;i+=3){rainPositions[i+1]-=fall;if(rainPositions[i+1]<-.6){rainPositions[i+1]=22+pseudoRandom(i+Math.floor(clock.elapsedTime*10))*18;rainPositions[i]=(pseudoRandom(i*3+clock.elapsedTime)-.5)*72;rainPositions[i+2]=(pseudoRandom(i*7+clock.elapsedTime)-.5)*88;}}
        rainPoints.geometry.attributes.position.needsUpdate=true;
      }
    }
  }

  function normalizeRoadName(name){return String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}

  function applyLiveTrafficData(data){
    liveTrafficBands=Array.isArray(data?.speedBands)?data.speedBands:[];
    liveTrafficIncidents=Array.isArray(data?.incidents)?data.incidents.filter(i=>Number.isFinite(Number(i.latitude))&&Number.isFinite(Number(i.longitude))):[];
    const byName=new Map();
    for(const b of liveTrafficBands){const k=normalizeRoadName(b.roadName);if(!k)continue;if(!byName.has(k))byName.set(k,[]);byName.get(k).push(b);}
    for(const seg of roadSegments){
      seg.liveTrafficKmh=null;const bands=byName.get(normalizeRoadName(seg.name));if(!bands?.length)continue;
      const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2,mc=unproject(mx,mz);let best=null,bestD=Infinity;
      for(const b of bands){const lat=(Number(b.startLat)+Number(b.endLat))/2,lon=(Number(b.startLon)+Number(b.endLon))/2;if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const d=haversineMeters(mc.lat,mc.lon,lat,lon);if(d<bestD){bestD=d;best=b;}}
      if(best&&bestD<220){const a=Number(best.minSpeed),z=Number(best.maxSpeed);seg.liveTrafficKmh=Number.isFinite(a)&&Number.isFinite(z)?(a+z)/2:(Number.isFinite(z)?z:null);}
    }
    ambientTraffic.forEach((a,i)=>{a.cruise=trafficCruiseFor(a.seg,i+17);});
    if(liveTrafficIncidents.length){
      const cc=currentCarCoords();let nearest=null,dist=Infinity;
      for(const i of liveTrafficIncidents){const d=haversineMeters(cc.lat,cc.lon,Number(i.latitude),Number(i.longitude));if(d<dist){dist=d;nearest=i;}}
      if(nearest&&dist<650){const key=`${nearest.type}:${nearest.message}`;if(key!==lastIncidentToastKey){lastIncidentToastKey=key;showToast(`${nearest.type||'Traffic incident'} nearby · ${Math.round(dist/50)*50} m`);}}
    }
  }

  async function refreshLiveTraffic(){
    if(trafficDataBusy||!BACKEND_ACTIVE||!car)return;trafficDataBusy=true;
    const c=currentCarCoords();
    try{const res=await fetch(`${BACKEND_BASE}/api/traffic?lat=${encodeURIComponent(c.lat)}&lon=${encodeURIComponent(c.lon)}&radius=2600`,{headers:{Accept:'application/json'}});if(res.ok){const data=await res.json();if(data?.configured)applyLiveTrafficData(data);}}
    catch(err){console.warn('Live traffic refresh failed',err?.message||err);}finally{trafficDataBusy=false;}
  }

  function maybeRefreshLiveTraffic(elapsed){
    if(lastTrafficDataRefresh>=0&&elapsed-lastTrafficDataRefresh<TRAFFIC_REFRESH_SECONDS)return;
    lastTrafficDataRefresh=elapsed;refreshLiveTraffic();
  }

  function toggleEngineSound() {
    engineSoundOn=!engineSoundOn;
    if(engineSoundOn)ensureEngineAudio();
    els.soundBtn.classList.toggle('sound-on',engineSoundOn);
    els.soundBtn.textContent='♪';
    updateEngineAudio();
  }

  function ensureEngineAudio() {
    if(engineAudio){engineAudio.ctx.resume?.();return;}
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      const ctx=new AC(),osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      osc.type='sawtooth';osc.frequency.value=55;filter.type='lowpass';filter.frequency.value=520;filter.Q.value=.7;gain.gain.value=.0001;
      osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start();
      engineAudio={ctx,osc,filter,gain};
    }catch(err){console.warn('Engine audio unavailable',err);engineSoundOn=false;}
  }

  function updateEngineAudio() {
    if(!engineAudio)return;
    const now=engineAudio.ctx.currentTime,target=engineSoundOn ? .028 : .0001;
    engineAudio.gain.gain.cancelScheduledValues(now);engineAudio.gain.gain.linearRampToValueAtTime(target,now+.08);
    const rev=55+Math.abs(speedMps)*5.4+input.gas*18;
    engineAudio.osc.frequency.setTargetAtTime(rev,now,.06);engineAudio.filter.frequency.setTargetAtTime(430+Math.abs(speedMps)*28,now,.08);
  }

  function buildWorld(data, center = {}) {
    const centerX = Number.isFinite(center.x) ? center.x : (Number.isFinite(center.centerX) ? center.centerX : 0);
    const centerZ = Number.isFinite(center.z) ? center.z : (Number.isFinite(center.centerZ) ? center.centerZ : 0);
    const normalizedCenter = { x: centerX, z: centerZ };
    const group = new THREE.Group();
    const segments = [];
    const sidewalkVerts = [];
    const edgeVerts = [];
    const roadVerts = [];
    const majorVerts = [];
    const lineVerts = [];
    const medianVerts = [];
    const bridgeStructureVerts = [];
    const tunnelStructureVerts = [];
    const waterVerts = [];
    const parkVerts = [];
    const buildingVerts = [[], [], [], [], []];
    const windowVerts = [];
    const storefrontVerts = [];
    const buildingDescriptors = [];
    const signalPoints = [];
    const crossingPoints = [];
    const busStopPoints = [];
    const waterPolygons = [];
    const parkPolygons = [];
    let roadCount = 0;
    let waterCount = 0;
    let parkCount = 0;

    for (const el of data.elements) {
      const tags = el.tags || {};
      if (el.type==='node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
        const p=project(el.lat,el.lon),dist=Math.hypot(p.x-centerX,p.z-centerZ);
        if(tags.highway==='traffic_signals'&&dist<=SIGNAL_RADIUS_METERS+80&&signalPoints.length<MAX_TRAFFIC_SIGNALS){signalPoints.push({...p,id:el.id});continue;}
        if(tags.highway==='crossing'&&dist<=SIGNAL_RADIUS_METERS+80&&crossingPoints.length<MAX_CROSSINGS){crossingPoints.push(p);continue;}
        if(tags.highway==='bus_stop'&&dist<=SIGNAL_RADIUS_METERS+80&&busStopPoints.length<MAX_BUS_STOPS){busStopPoints.push(p);continue;}
      }
      if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;

      if (tags.highway) {
        const type = tags.highway;
        const width = widthForRoad(tags);
        const major = isMajorRoad(type);
        const roadY = roadElevationForTags(tags);
        const lanes = laneCountForRoad(tags);
        const oneway=tags.oneway||'';
        const isBridge=roadIsBridge(tags);
        const isTunnel=roadIsTunnel(tags);
        const points = cleanPolyline(el.geometry.map(p => ({...project(p.lat, p.lon), y:roadY})));
        if (points.length < 2) continue;
        if(isBridge&&points.length>=3){
          const layer=parseRoadLayer(tags.layer),approachY=Math.max(0,(layer-1)*3.35);
          points[0].y=approachY;points[points.length-1].y=approachY;
        }

        // Pavement/shoulder first, then curb/edge, then asphalt. This produces a continuous
        // readable street section without creating a mesh for every road segment.
        if(!/motorway/.test(type)) appendRoadRibbon(sidewalkVerts, points, width + (major ? 3.3 : 4.8), roadY + .006, true);
        appendRoadRibbon(edgeVerts, points, width + (major ? 1.7 : 2.15), roadY + .019, true);
        appendRoadRibbon(major ? majorVerts : roadVerts, points, width, roadY + .043, true);
        if(lanes>=4&&!/^(yes|1|-1)$/.test(String(oneway))&&!isTunnel) appendRoadRibbon(medianVerts,points,Math.min(1.35,width*.09),roadY+.072,false);

        const waySegments = [];
        const nodeIds=Array.isArray(el.nodes)?el.nodes:[];
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const length = Math.hypot(dx, dz);
          if (length < .6 || length > 1500) continue;
          const fromKey=nodeIds[i]!=null?`n${nodeIds[i]}`:graphPointKey(a.x,a.z);
          const toKey=nodeIds[i+1]!=null?`n${nodeIds[i+1]}`:graphPointKey(b.x,b.z);
          const seg = {
            ax:a.x, az:a.z, bx:b.x, bz:b.z, width, major, lanes, type,
            ay:Number.isFinite(a.y)?a.y:roadY, by:Number.isFinite(b.y)?b.y:roadY, y:((Number.isFinite(a.y)?a.y:roadY)+(Number.isFinite(b.y)?b.y:roadY))/2, bridge:isBridge, tunnel:isTunnel, layer:parseRoadLayer(tags.layer),
            fromKey,toKey,
            oneway,
            name: roadDisplayName(tags),
            speedLimit: parseSpeedLimit(tags.maxspeed)
          };
          segments.push(seg);
          waySegments.push(seg);
          if(isBridge)appendBridgeStructure(bridgeStructureVerts,seg);
          else if(/motorway|trunk/.test(type)&&!isTunnel)appendExpresswayGuardrails(bridgeStructureVerts,seg);
          if(isTunnel)appendTunnelStructure(tunnelStructureVerts,seg);
        }
        appendWayLaneMarkings(lineVerts, waySegments, width, lanes, oneway);
        roadCount++;
      } else if (tags.building || tags['building:part']) {
        const b = buildingDescriptor(el, normalizedCenter);
        if (b) buildingDescriptors.push(b);
      } else if (isWaterFeature(tags)) {
        const pts = cleanPolygon(el.geometry.map(p => project(p.lat, p.lon)));
        if (appendFlatPolygon(waterVerts, pts, 0.004)) { waterCount++; waterPolygons.push(pts); }
      } else if (isParkFeature(tags)) {
        const pts = cleanPolygon(el.geometry.map(p => project(p.lat, p.lon)));
        if (appendFlatPolygon(parkVerts, pts, -0.002)) { parkCount++; parkPolygons.push(pts); }
      }
    }

    if (sidewalkVerts.length) group.add(meshFromFlatVertices(sidewalkVerts, shared.sidewalk, true));
    if (edgeVerts.length) group.add(meshFromFlatVertices(edgeVerts, shared.roadEdge, true));
    if (roadVerts.length) group.add(meshFromFlatVertices(roadVerts, shared.road, true));
    if (majorVerts.length) group.add(meshFromFlatVertices(majorVerts, shared.majorRoad, true));
    if (medianVerts.length) group.add(meshFromFlatVertices(medianVerts, shared.median, true));
    if (bridgeStructureVerts.length) group.add(meshFromFlatVertices(bridgeStructureVerts, shared.bridge, true));
    if (tunnelStructureVerts.length) group.add(meshFromFlatVertices(tunnelStructureVerts, shared.tunnel, true));
    if (lineVerts.length) {
      const lines = meshFromFlatVertices(lineVerts, shared.line, false);
      lines.renderOrder = 4;
      group.add(lines);
    }
    if (waterVerts.length) {
      const water = meshFromFlatVertices(waterVerts, shared.water, false);
      water.renderOrder = 1;
      group.add(water);
    }
    if (parkVerts.length) {
      const parks = meshFromFlatVertices(parkVerts, shared.park, false);
      parks.renderOrder = 1;
      group.add(parks);
    }

    const filteredBuildings=filterBuildingShellsWithParts(buildingDescriptors);
    filteredBuildings.sort((a,b) => a.distance - b.distance);
    const selectedBuildings = filteredBuildings.slice(0, MAX_BUILDINGS);
    const windowBudget={count:0};
    selectedBuildings.forEach((b,index) => {
      appendBuildingGeometry(buildingVerts[b.bucket], b);
      if(index<MAX_FACADE_BUILDINGS&&windowBudget.count<MAX_BUILDING_WINDOWS)appendBuildingFacade(windowVerts,storefrontVerts,b,windowBudget);
    });
    buildingVerts.forEach((verts, bucket) => {
      if (!verts.length) return;
      const mesh = meshFromFlatVertices(verts, shared.buildings[bucket], true);
      mesh.castShadow = false;
      group.add(mesh);
    });
    if(windowVerts.length){const mesh=meshFromFlatVertices(windowVerts,shared.windows,false);mesh.renderOrder=3;group.add(mesh);}
    if(storefrontVerts.length){const mesh=meshFromFlatVertices(storefrontVerts,shared.storefront,false);mesh.renderOrder=3;group.add(mesh);}

    const signalDescriptors=mapSignalsToSegments(signalPoints,segments);
    const roadGraphBuilt=buildRoadGraph(segments);
    const trafficSignalCount = addTrafficSignals(group, signalPoints);
    const crossingCount = addPedestrianCrossings(group,crossingPoints,segments);
    const busStopCount = addBusStops(group,busStopPoints);
    const streetLightCount=addStreetLights(group,segments,centerX,centerZ,selectedBuildings);
    const gantryCount=addRoadGantries(group,segments,centerX,centerZ);
    const treeCount = addRoadsideTrees(group, segments, centerX, centerZ, selectedBuildings);
    addLandmarksTo(group,centerX,centerZ);
    return {
      group, segments, roadGraph:roadGraphBuilt, signalDescriptors, roadCount,
      buildingCount: selectedBuildings.length,
      buildingColliders: selectedBuildings,
      waterPolygons, parkPolygons,
      treeCount, streetLightCount, gantryCount, waterCount, parkCount, trafficSignalCount, crossingCount, busStopCount
    };
  }

  function graphPointKey(x,z){return `p${Math.round(x*2)/2},${Math.round(z*2)/2}`;}
  function parseRoadLayer(value){const n=Number.parseInt(value,10);return Number.isFinite(n)?Math.max(-3,Math.min(5,n)):0;}
  function roadIsBridge(tags={}){const v=String(tags.bridge||'').toLowerCase();return Boolean(v&&v!=='no');}
  function roadIsTunnel(tags={}){const v=String(tags.tunnel||'').toLowerCase();return Boolean((v&&v!=='no')||String(tags.covered||'').toLowerCase()==='yes');}
  function roadElevationForTags(tags={}){
    const layer=parseRoadLayer(tags.layer);
    if(roadIsBridge(tags))return BRIDGE_BASE_HEIGHT+Math.max(0,layer)*3.6;
    if(layer>0)return layer*3.35;
    return 0;
  }

  function segmentYAt(seg,t=.5){const ay=Number.isFinite(seg?.ay)?seg.ay:(seg?.y||0),by=Number.isFinite(seg?.by)?seg.by:(seg?.y||0);return ay+(by-ay)*THREE.MathUtils.clamp(t,0,1);}

  function appendPrismBetween(out,seg,width,height,bottomY,sideOffset=0){
    const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<.2)return;
    const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,half=width/2;
    const ax=seg.ax+nx*sideOffset,az=seg.az+nz*sideOffset,bx=seg.bx+nx*sideOffset,bz=seg.bz+nz*sideOffset;
    const bl=[ax+nx*half,bottomY,az+nz*half],br=[ax-nx*half,bottomY,az-nz*half],
          el=[bx+nx*half,bottomY,bz+nz*half],er=[bx-nx*half,bottomY,bz-nz*half];
    const top=bottomY+height;
    const tl=[bl[0],top,bl[2]],tr=[br[0],top,br[2]],etl=[el[0],top,el[2]],etr=[er[0],top,er[2]];
    pushTri(out,bl,br,tr);pushTri(out,bl,tr,tl);
    pushTri(out,el,etl,etr);pushTri(out,el,etr,er);
    pushTri(out,bl,tl,etl);pushTri(out,bl,etl,el);
    pushTri(out,br,er,etr);pushTri(out,br,etr,tr);
    pushTri(out,tl,tr,etr);pushTri(out,tl,etr,etl);
    pushTri(out,bl,el,er);pushTri(out,bl,er,br);
  }

  function appendAxisBox(out,cx,cz,w,d,bottomY,topY){
    const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2;
    const a=[x0,bottomY,z0],b=[x1,bottomY,z0],c=[x1,bottomY,z1],d0=[x0,bottomY,z1];
    const A=[x0,topY,z0],B=[x1,topY,z0],C=[x1,topY,z1],D=[x0,topY,z1];
    pushTri(out,a,b,B);pushTri(out,a,B,A);pushTri(out,b,c,C);pushTri(out,b,C,B);
    pushTri(out,c,d0,D);pushTri(out,c,D,C);pushTri(out,d0,a,A);pushTri(out,d0,A,D);
    pushTri(out,A,B,C);pushTri(out,A,C,D);pushTri(out,a,d0,c);pushTri(out,a,c,b);
  }

  function appendBridgeStructure(out,seg){
    const railOffset=seg.width/2+.28;
    appendPrismBetween(out,seg,.20,.72,seg.y+.08,railOffset);
    appendPrismBetween(out,seg,.20,.72,seg.y+.08,-railOffset);
    if(seg.y<2)return;
    const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<16)return;
    const steps=Math.max(1,Math.floor(len/34));
    for(let i=1;i<=steps;i++){
      const t=i/(steps+1),cx=seg.ax+dx*t,cz=seg.az+dz*t;
      appendAxisBox(out,cx,cz,.9,.9,-.08,Math.max(.5,seg.y-.12));
    }
  }

  function appendExpresswayGuardrails(out,seg){
    const side=seg.width/2+.18;appendPrismBetween(out,seg,.14,.48,(seg.y||0)+.06,side);appendPrismBetween(out,seg,.14,.48,(seg.y||0)+.06,-side);
  }

  function appendTunnelStructure(out,seg){
    const side=seg.width/2+.48;
    appendPrismBetween(out,seg,.34,3.45,seg.y+.02,side);
    appendPrismBetween(out,seg,.34,3.45,seg.y+.02,-side);
    appendPrismBetween(out,seg,seg.width+1.3,.24,seg.y+3.28,0);
  }

  function filterBuildingShellsWithParts(buildings){
    const parts=buildings.filter(b=>b.isPart),shells=buildings.filter(b=>!b.isPart);
    if(!parts.length)return buildings;
    const cell=90,grid=new Map();
    for(const part of parts){const key=`${Math.floor(part.x/cell)},${Math.floor(part.z/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(part);}
    const kept=[];
    for(const shell of shells){
      const gx=Math.floor(shell.x/cell),gz=Math.floor(shell.z/cell);let covered=0,count=0;
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(const part of grid.get(`${gx+dx},${gz+dz}`)||[]){
        if(part.x<shell.bounds.minX||part.x>shell.bounds.maxX||part.z<shell.bounds.minZ||part.z>shell.bounds.maxZ)continue;
        if(pointInPolygonXZ(part.x,part.z,shell.pts)){covered+=part.area;count++;}
      }
      if(!(count>=2||covered>shell.area*.38))kept.push(shell);
    }
    return [...kept,...parts];
  }

  function nearestRoadHitInSegments(x,z,segments){
    let best=null;
    for(const seg of segments){
      if(x<Math.min(seg.ax,seg.bx)-35||x>Math.max(seg.ax,seg.bx)+35||z<Math.min(seg.az,seg.bz)-35||z>Math.max(seg.az,seg.bz)+35)continue;
      const hit=closestPointOnSegment(x,z,seg);if(!best||hit.dist<best.dist)best={...hit,seg};
    }
    return best;
  }

  function mapSignalsToSegments(points,segments){
    for(const seg of segments)seg.signals=[];
    const out=[];
    for(const p of points){
      const hit=nearestRoadHitInSegments(p.x,p.z,segments);if(!hit||hit.dist>14)continue;
      p.y=segmentYAt(hit.seg,hit.t);const d={x:p.x,z:p.z,y:p.y,seg:hit.seg,t:hit.t};hit.seg.signals.push(d);out.push(d);
    }
    return out;
  }

  function trafficCanTraverse(seg,dir){
    const one=String(seg.oneway||'').toLowerCase();
    if(one==='-1')return dir<0;
    if(one==='yes'||one==='1'||one==='true')return dir>0;
    return true;
  }

  function buildRoadGraph(segments){
    const graph=new Map();
    const add=(key,seg,dir)=>{if(!key||!trafficCanTraverse(seg,dir))return;if(!graph.has(key))graph.set(key,[]);graph.get(key).push({seg,dir});};
    for(const seg of segments){add(seg.fromKey,seg,1);add(seg.toKey,seg,-1);}
    return graph;
  }

  function appendBuildingFacade(windowOut,storeOut,b,budget){
    if(!b.pts?.length||b.wallTop-b.minHeight<5||budget.count>=MAX_BUILDING_WINDOWS)return;
    const office=b.bucket===1||b.bucket===4,commercial=/retail|commercial|mall|hotel/.test(String(b.kind||''));
    const spacing=office?3.25:4.15,windowH=office?1.55:1.25,windowW=office?1.75:1.35;
    const floorStep=b.distance<210?1:2,floorH=3.05;
    const areaSign=polygonArea(b.pts)>=0?1:-1;
    for(let ei=0;ei<b.pts.length&&budget.count<MAX_BUILDING_WINDOWS;ei++){
      const a=b.pts[ei],c=b.pts[(ei+1)%b.pts.length],dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz);if(len<5)continue;
      const ux=dx/len,uz=dz/len;
      const nx=(areaSign>0?dz:-dz)/len,nz=(areaSign>0?-dx:dx)/len;
      const cols=Math.min(18,Math.max(1,Math.floor((len-2)/spacing)));
      for(let floor=0;;floor+=floorStep){
        const cy=b.minHeight+2.15+floor*floorH;if(cy+windowH/2>b.wallTop-.55)break;
        for(let col=0;col<cols&&budget.count<MAX_BUILDING_WINDOWS;col++){
          if(pseudoRandom(b.id*13+ei*97+floor*31+col*7)<.10)continue;
          const t=(col+1)/(cols+1),cx=a.x+dx*t+nx*.045,cz=a.z+dz*t+nz*.045,hw=Math.min(windowW,len/(cols+1)*.62)/2,hh=windowH/2;
          const l=[cx-ux*hw,cy-hh,cz-uz*hw],r=[cx+ux*hw,cy-hh,cz+uz*hw],rt=[cx+ux*hw,cy+hh,cz+uz*hw],lt=[cx-ux*hw,cy+hh,cz-uz*hw];
          pushTri(windowOut,l,r,rt);pushTri(windowOut,l,rt,lt);budget.count++;
        }
      }
      if(commercial&&b.minHeight<1&&b.distance<300){
        const cols2=Math.min(8,Math.max(1,Math.floor(len/5.2)));
        for(let col=0;col<cols2;col++){
          const t=(col+.5)/cols2,cx=a.x+dx*t+nx*.052,cz=a.z+dz*t+nz*.052,hw=Math.min(2.0,len/cols2*.38),cy=1.75,hh=1.45;
          const l=[cx-ux*hw,cy-hh,cz-uz*hw],r=[cx+ux*hw,cy-hh,cz+uz*hw],rt=[cx+ux*hw,cy+hh,cz+uz*hw],lt=[cx-ux*hw,cy+hh,cz-uz*hw];
          pushTri(storeOut,l,r,rt);pushTri(storeOut,l,rt,lt);
        }
      }
    }
  }

  function addRoadGantries(group,segments,centerX,centerZ){
    const items=[];
    for(let i=0;i<segments.length&&items.length<14;i++){
      const seg=segments[i];if(!/motorway|trunk|primary/.test(seg.type||''))continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<75)continue;
      const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2;if(Math.hypot(mx-centerX,mz-centerZ)>780)continue;
      if(pseudoRandom(i*83+seg.ax*.2)<.76)continue;
      items.push({seg,t:.42+pseudoRandom(i*29)*.16});
    }
    if(!items.length)return 0;
    const signGeo=new THREE.BoxGeometry(8.6,2.05,.24),poleGeo=new THREE.BoxGeometry(.18,5.8,.18);
    const signs=new THREE.InstancedMesh(signGeo,shared.gantrySign,items.length),poles=new THREE.InstancedMesh(poleGeo,shared.gantryPole,items.length*2);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);let pi=0;
    items.forEach((it,i)=>{
      const s=it.seg,dx=s.bx-s.ax,dz=s.bz-s.az,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,x=s.ax+dx*it.t,z=s.az+dz*it.t,y=s.y||0,yaw=Math.atan2(dx,dz);
      quat.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);pos.set(x,y+5.35,z);m.compose(pos,quat,scale);signs.setMatrixAt(i,m);
      for(const side of [-1,1]){pos.set(x+nx*(s.width/2+.75)*side,y+2.9,z+nz*(s.width/2+.75)*side);m.compose(pos,quat,scale);poles.setMatrixAt(pi++,m);}
    });
    [signs,poles].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});return items.length;
  }

  function addStreetLights(group,segments,centerX,centerZ,buildings=[]){
    const lamps=[];
    for(let si=0;si<segments.length&&lamps.length<MAX_STREET_LIGHTS;si++){
      const seg=segments[si];if(seg.tunnel||/service|living_street/.test(seg.type||''))continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<32)continue;
      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,spacing=seg.major?46:62,seed=Math.abs(Math.round(seg.ax*7+seg.az*11+si*23));
      for(let d=spacing*.45;d<len&&lamps.length<MAX_STREET_LIGHTS;d+=spacing){
        const side=(Math.floor(d/spacing)+si)%2?1:-1,off=seg.width/2+(seg.major?2.3:2.9),x=seg.ax+ux*d+nx*off*side,z=seg.az+uz*d+nz*off*side;
        if(Math.hypot(x-centerX,z-centerZ)>BUILDING_RADIUS_METERS+320||pointHitsBuildingBounds(x,z,buildings,1.2))continue;
        lamps.push({x,z,y:seg.y||0,scale:.94+pseudoRandom(seed+d)*.12});
      }
    }
    if(!lamps.length)return 0;
    const poleGeo=new THREE.CylinderGeometry(.055,.09,4.7,6),lampGeo=new THREE.SphereGeometry(.13,6,5);
    const poles=new THREE.InstancedMesh(poleGeo,shared.streetPole,lamps.length),heads=new THREE.InstancedMesh(lampGeo,shared.streetLamp,lamps.length);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    lamps.forEach((l,i)=>{scale.set(l.scale,l.scale,l.scale);pos.set(l.x,l.y+2.35*l.scale,l.z);m.compose(pos,quat,scale);poles.setMatrixAt(i,m);pos.set(l.x,l.y+4.72*l.scale,l.z);m.compose(pos,quat,scale);heads.setMatrixAt(i,m);});
    [poles,heads].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});
    return lamps.length;
  }

  function cleanPolyline(points) {
    const out=[];
    for(const p of points){
      const last=out[out.length-1];
      if(!last || Math.hypot(p.x-last.x,p.z-last.z)>.18) out.push(p);
    }
    return out;
  }

  function cleanPolygon(points) {
    const out=cleanPolyline(points);
    if(out.length<4)return [];
    const closure=Math.hypot(out[0].x-out[out.length-1].x,out[0].z-out[out.length-1].z);
    if(closure>1.2)return [];
    out.pop();
    return out.length>=3 ? out : [];
  }

  function appendRoadRibbon(out, points, width, y, roundCaps=false) {
    if(points.length<2)return;
    const half=width/2;
    const pairs=[];
    const firstY=Number.isFinite(points[0]?.y)?points[0].y:null;
    const yOffset=firstY==null?y:(Math.abs(y-firstY)<1?y-firstY:y);
    for(let i=0;i<points.length;i++){
      const p=points[i];
      const prev=points[Math.max(0,i-1)], next=points[Math.min(points.length-1,i+1)];
      let pDx=p.x-prev.x,pDz=p.z-prev.z,nDx=next.x-p.x,nDz=next.z-p.z;
      let pLen=Math.hypot(pDx,pDz),nLen=Math.hypot(nDx,nDz);
      if(pLen<.001){pDx=nDx;pDz=nDz;pLen=nLen||1;}
      if(nLen<.001){nDx=pDx;nDz=pDz;nLen=pLen||1;}
      pDx/=pLen;pDz/=pLen;nDx/=nLen;nDz/=nLen;
      const pn={x:-pDz,z:pDx}, nn={x:-nDz,z:nDx};
      let ox,oz;
      if(i===0){ox=nn.x*half;oz=nn.z*half;}
      else if(i===points.length-1){ox=pn.x*half;oz=pn.z*half;}
      else{
        let mx=pn.x+nn.x,mz=pn.z+nn.z;
        const ml=Math.hypot(mx,mz);
        if(ml<.08){mx=nn.x;mz=nn.z;}
        else{mx/=ml;mz/=ml;}
        const denom=mx*nn.x+mz*nn.z;
        let miter=half/Math.max(.34,Math.abs(denom));
        miter=Math.min(miter,half*2.15);
        ox=mx*miter;oz=mz*miter;
      }
      const py=Number.isFinite(p.y)?p.y+yOffset:y;
      pairs.push({l:[p.x+ox,py,p.z+oz],r:[p.x-ox,py,p.z-oz]});
    }
    for(let i=0;i<pairs.length-1;i++){
      const a=pairs[i],b=pairs[i+1];
      pushTri(out,a.l,a.r,b.r);pushTri(out,a.l,b.r,b.l);
    }
    if(roundCaps){
      appendRoadCap(out,points[0],half,pairs[0].l[1]);
      appendRoadCap(out,points[points.length-1],half,pairs[pairs.length-1].l[1]);
    }
  }

  function appendRoadCap(out,p,r,y) {
    const steps=8,c=[p.x,y,p.z];
    for(let i=0;i<steps;i++){
      const a=i*Math.PI*2/steps,b=(i+1)*Math.PI*2/steps;
      pushTri(out,c,[p.x+Math.cos(a)*r,y,p.z+Math.sin(a)*r],[p.x+Math.cos(b)*r,y,p.z+Math.sin(b)*r]);
    }
  }

  function laneCountForRoad(tags={}) {
    const tagged=Number.parseInt(tags.lanes,10);
    if(Number.isFinite(tagged)&&tagged>0&&tagged<9)return tagged;
    const type=tags.highway||'';
    const oneWay=/^(yes|1|-1)$/.test(String(tags.oneway||''));
    if(oneWay)return /motorway|trunk|primary|secondary/.test(type)?2:1;
    if(/service|living_street/.test(type))return 1;
    return 2;
  }

  function appendWayLaneMarkings(out, segments, width, lanes, oneway) {
    if(!segments.length||lanes<2)return;
    const offsets=[];
    for(let i=1;i<lanes;i++) offsets.push(-width/2+(width*i/lanes));
    // A mapped one-way carriageway has only same-direction lane dividers. A normal
    // two-way road also uses the center divider from the same calculated offsets.
    for(const seg of segments) for(const offset of offsets) appendOffsetDashes(out,seg,offset);
  }

  function appendOffsetDashes(out, seg, offset) {
    const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1;
    if(len<7)return;
    const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
    const dash=4.4,gap=6.8,step=dash+gap,half=.075;
    for(let start=2.4;start<len-1;start+=step){
      const end=Math.min(len-.6,start+dash);
      const ax=seg.ax+ux*start+nx*offset,az=seg.az+uz*start+nz*offset;
      const bx=seg.ax+ux*end+nx*offset,bz=seg.az+uz*end+nz*offset;
      const px=nx*half,pz=nz*half;
      const yA=segmentYAt(seg,start/len)+.072,yB=segmentYAt(seg,end/len)+.072;
      pushTri(out,[ax+px,yA,az+pz],[ax-px,yA,az-pz],[bx-px,yB,bz-pz]);
      pushTri(out,[ax+px,yA,az+pz],[bx-px,yB,bz-pz],[bx+px,yB,bz+pz]);
    }
  }

  function appendFlatPolygon(out, pts, y) {
    if(!pts||pts.length<3)return false;
    const area=Math.abs(polygonArea(pts));
    if(area<8||area>180000)return false;
    let tris;
    try{tris=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(p.x,p.z)),[]);}catch(_){return false;}
    if(!tris?.length)return false;
    for(const tri of tris){
      const a=pts[tri[0]],b=pts[tri[1]],c=pts[tri[2]];
      pushTri(out,[a.x,y,a.z],[b.x,y,b.z],[c.x,y,c.z]);
    }
    return true;
  }

  function polygonArea(pts) {
    let a=0;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++) a+=pts[j].x*pts[i].z-pts[i].x*pts[j].z;
    return a*.5;
  }

  function appendBuildingGeometry(out,b) {
    const pts=b.pts, bottom=b.minHeight, wallTop=b.wallTop;
    if(!pts||pts.length<3||wallTop<=bottom+.5)return;
    for(let i=0;i<pts.length;i++){
      const a=pts[i],c=pts[(i+1)%pts.length];
      const ab=[a.x,bottom,a.z],at=[a.x,wallTop,a.z],cb=[c.x,bottom,c.z],ct=[c.x,wallTop,c.z];
      pushTri(out,ab,cb,ct);pushTri(out,ab,ct,at);
    }
    appendBuildingRoof(out,b);
  }

  function appendBuildingRoof(out,b){
    const pts=b.pts;if(!pts?.length)return;
    if(!b.roofHeight||b.roofShape==='flat'){
      try{
        const tris=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(p.x,p.z)),[]);
        for(const tri of tris){const a=pts[tri[0]],c=pts[tri[1]],d=pts[tri[2]];pushTri(out,[a.x,b.h,a.z],[c.x,b.h,c.z],[d.x,b.h,d.z]);}
      }catch(_){}
      return;
    }
    if(b.roofShape==='skillion'){
      const span=Math.max(1,b.w),x0=b.x-span/2;
      try{
        const tris=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(p.x,p.z)),[]);
        for(const tri of tris){
          const vv=tri.map(i=>pts[i]).map(p=>[p.x,b.wallTop+b.roofHeight*THREE.MathUtils.clamp((p.x-x0)/span,0,1),p.z]);
          pushTri(out,vv[0],vv[1],vv[2]);
        }
      }catch(_){}
      return;
    }
    // A low-poly apex/fan is a robust approximation for hipped, pyramidal, dome and
    // other mapped non-flat roofs without adding one draw call per building.
    const apex=[b.x,b.h,b.z];
    for(let i=0;i<pts.length;i++){
      const a=pts[i],c=pts[(i+1)%pts.length];
      pushTri(out,[a.x,b.wallTop,a.z],[c.x,b.wallTop,c.z],apex);
    }
  }

  function isWaterFeature(tags={}) {
    return tags.natural==='water'||tags.waterway==='riverbank';
  }

  function isParkFeature(tags={}) {
    return tags.leisure==='park'||/^(grass|recreation_ground|meadow)$/.test(tags.landuse||'');
  }

  function addTrafficSignals(group, points) {
    if(!points.length)return 0;
    const count=Math.min(points.length,MAX_TRAFFIC_SIGNALS);
    const poleGeo=new THREE.CylinderGeometry(.075,.095,2.55,6);
    const headGeo=new THREE.BoxGeometry(.42,.84,.28);
    const lampGeo=new THREE.SphereGeometry(.09,6,5);
    const poles=new THREE.InstancedMesh(poleGeo,shared.signalPole,count);
    const heads=new THREE.InstancedMesh(headGeo,shared.signalHead,count);
    const reds=new THREE.InstancedMesh(lampGeo,shared.signalRed,count);
    const ambers=new THREE.InstancedMesh(lampGeo,shared.signalAmber,count);
    const greens=new THREE.InstancedMesh(lampGeo,shared.signalGreen,count);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
    for(let i=0;i<count;i++){
      const p=points[i];
      const y=p.y||0;
      pos.set(p.x,y+1.275,p.z);m.compose(pos,quat,scale);poles.setMatrixAt(i,m);
      pos.set(p.x,y+2.62,p.z);m.compose(pos,quat,scale);heads.setMatrixAt(i,m);
      pos.set(p.x,y+2.86,p.z-.15);m.compose(pos,quat,scale);reds.setMatrixAt(i,m);
      pos.set(p.x,y+2.62,p.z-.15);m.compose(pos,quat,scale);ambers.setMatrixAt(i,m);
      pos.set(p.x,y+2.38,p.z-.15);m.compose(pos,quat,scale);greens.setMatrixAt(i,m);
    }
    [poles,heads,reds,ambers,greens].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});
    return count;
  }

  function addPedestrianCrossings(group,points,segments) {
    if(!points.length||!segments.length)return 0;
    const verts=[];let count=0;
    for(const p of points){
      let best=null;
      for(const seg of segments){
        if(Math.abs(((seg.ax+seg.bx)/2)-p.x)>55||Math.abs(((seg.az+seg.bz)/2)-p.z)>55)continue;
        const hit=closestPointOnSegment(p.x,p.z,seg);if(!best||hit.dist<best.dist)best={...hit,seg};
      }
      if(!best||best.dist>12)continue;
      const seg=best.seg,dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
      const halfAcross=Math.max(2.1,seg.width*.43),stripeHalf=.23;
      for(let k=-2;k<=2;k++){
        const along=k*1.05,cx=best.x+ux*along,cz=best.z+uz*along;
        const y=segmentYAt(seg,best.t)+.082;
        const a=[cx+nx*halfAcross+ux*stripeHalf,y,cz+nz*halfAcross+uz*stripeHalf];
        const b=[cx-nx*halfAcross+ux*stripeHalf,y,cz-nz*halfAcross+uz*stripeHalf];
        const c=[cx-nx*halfAcross-ux*stripeHalf,y,cz-nz*halfAcross-uz*stripeHalf];
        const d=[cx+nx*halfAcross-ux*stripeHalf,y,cz+nz*halfAcross-uz*stripeHalf];
        pushTri(verts,a,b,c);pushTri(verts,a,c,d);
      }
      count++;if(count>=MAX_CROSSINGS)break;
    }
    if(verts.length){const mesh=meshFromFlatVertices(verts,shared.line,false);mesh.renderOrder=5;group.add(mesh);}
    return count;
  }

  function addBusStops(group,points) {
    const count=Math.min(points.length,MAX_BUS_STOPS);if(!count)return 0;
    const poleGeo=new THREE.CylinderGeometry(.055,.07,2.35,6),signGeo=new THREE.BoxGeometry(.55,.42,.10);
    const poles=new THREE.InstancedMesh(poleGeo,shared.busStopPole,count),signs=new THREE.InstancedMesh(signGeo,shared.busStopSign,count);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
    for(let i=0;i<count;i++){
      const p=points[i];pos.set(p.x,1.175,p.z);m.compose(pos,quat,scale);poles.setMatrixAt(i,m);
      pos.set(p.x,2.15,p.z);m.compose(pos,quat,scale);signs.setMatrixAt(i,m);
    }
    [poles,signs].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});
    return count;
  }

  function addRoadsideTrees(group, segments, centerX, centerZ, buildings=[]) {
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
        if(pointHitsBuildingBounds(x,z,buildings,2.2))continue;
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

  function pointHitsBuildingBounds(x,z,buildings,pad=0) {
    for(const b of buildings){
      const q=b.bounds;
      if(x>=q.minX-pad&&x<=q.maxX+pad&&z>=q.minZ-pad&&z<=q.maxZ+pad)return true;
    }
    return false;
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
    const pts=cleanPolygon(el.geometry.map(p=>project(p.lat,p.lon)));
    if(pts.length<3)return null;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    pts.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
    const area=Math.abs(polygonArea(pts));
    const w=maxX-minX,d=maxZ-minZ;
    if(area<8||area>45000||w>260||d>260)return null;
    const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
    const distance=Math.hypot(x-center.x,z-center.z);
    if(distance>BUILDING_RADIUS_METERS+130)return null;

    const tags=el.tags||{};
    const kind=String(tags['building:part']||tags.building||'').toLowerCase();
    const isPart=Boolean(tags['building:part']);
    let roofShape=String(tags['roof:shape']||'flat').toLowerCase();
    if(!/^(flat|skillion|gabled|hipped|pyramidal|dome|onion|cone|conical|round|mansard|gambrel)$/.test(roofShape))roofShape='flat';
    let roofHeight=parseMeasureMeters(tags['roof:height']);
    if(!Number.isFinite(roofHeight)){
      const roofLevels=Number.parseFloat(tags['roof:levels']);
      if(Number.isFinite(roofLevels))roofHeight=Math.max(0,roofLevels*2.0);
    }
    if(!Number.isFinite(roofHeight))roofHeight=roofShape==='flat'?0:Math.min(5.5,Math.max(1.2,Math.sqrt(area)*.11));

    let h=parseMeasureMeters(tags.height);
    const levels=Number.parseFloat(tags['building:levels']);
    if(!Number.isFinite(h) && Number.isFinite(levels))h=Math.max(3,levels*3.05+roofHeight);
    if(!Number.isFinite(h))h=fallbackBuildingHeight(tags,el.id)+roofHeight;
    h=Math.max(3,Math.min(h,235));

    let minHeight=parseMeasureMeters(tags.min_height);
    if(!Number.isFinite(minHeight)){
      const minLevel=Number.parseFloat(tags['building:min_level']);
      minHeight=Number.isFinite(minLevel)?Math.max(0,minLevel*3.05):0;
    }
    minHeight=Math.max(0,Math.min(minHeight,h-1));
    roofHeight=Math.max(0,Math.min(roofHeight,Math.max(0,h-minHeight-1)));
    const wallTop=Math.max(minHeight+1,h-roofHeight);
    return {
      id:Number(el.id)||1,pts,x,z,w,d,h,wallTop,roofHeight,roofShape,minHeight,distance,area,isPart,kind,
      name:tags.name||'',
      bounds:{minX,maxX,minZ,maxZ},
      bucket:buildingMaterialBucket(tags,el.id)
    };
  }

  function fallbackBuildingHeight(tags,id) {
    const t=String(tags['building:part']||tags.building||'').toLowerCase();
    const r=pseudoRandom(id);
    if(/apartments|residential|dormitory/.test(t))return 22+r*34;
    if(/office|commercial|retail|hotel/.test(t))return 16+r*44;
    if(/industrial|warehouse/.test(t))return 8+r*10;
    if(/house|detached|terrace|semidetached_house/.test(t))return 6.5+r*4.5;
    if(/school|hospital|civic|public|government/.test(t))return 10+r*18;
    return 9+r*28;
  }

  function buildingMaterialBucket(tags,id) {
    const t=String(tags['building:part']||tags.building||'').toLowerCase();
    const material=String(tags['building:material']||tags.material||'').toLowerCase();
    const facade=String(tags['building:facade:material']||'').toLowerCase();
    if(/glass/.test(material)||/glass/.test(facade)||/office|commercial|hotel/.test(t)&&pseudoRandom(id*19)>.42)return 4;
    if(/apartments|residential|dormitory|house|detached|terrace/.test(t))return 0;
    if(/office|commercial|retail|hotel/.test(t))return 1;
    if(/industrial|warehouse|garage/.test(t))return 2;
    if(/school|hospital|civic|public|government|university/.test(t))return 3;
    return Math.abs(Number(id)||0)%4;
  }

  function parseMeasureMeters(value) {
    if(value==null)return NaN;
    const raw=String(value).trim().toLowerCase().replace(',','.');
    const n=Number.parseFloat(raw);
    if(!Number.isFinite(n))return NaN;
    if(/ft|feet|foot|'/.test(raw))return n*.3048;
    return n;
  }

  function parseSpeedLimit(value) {
    if(value==null)return null;
    const raw=String(value).trim().toLowerCase();
    if(!raw||raw==='none'||raw==='signals'||raw==='variable')return null;
    const n=Number.parseFloat(raw);
    if(!Number.isFinite(n)||n<=0||n>200)return null;
    return /mph/.test(raw)?Math.round(n*1.60934):Math.round(n);
  }

  function widthForRoad(tags) {
    const explicit=parseMeasureMeters(tags.width);
    if(Number.isFinite(explicit)&&explicit>=2&&explicit<=30)return explicit;
    const base=ROAD_WIDTHS[tags.highway]||5.5;
    const lanes=Number.parseInt(tags.lanes,10);
    if(Number.isFinite(lanes)&&lanes>0)return Math.max(base,Math.min(18,lanes*3.05+.55));
    return base;
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
      else if (lm.kind==='artscience') addArtScience(group,p.x,p.z);
      else if (lm.kind==='merlion') addMerlion(group,p.x,p.z);
      else if (lm.kind==='supertrees') addSupertrees(group,p.x,p.z);
      else if (lm.kind==='mbfc') addMbfc(group,p.x,p.z);
      else if (lm.kind==='fullerton') addFullerton(group,p.x,p.z);
      else if (lm.kind==='ion') addIon(group,p.x,p.z);
      else if (lm.kind==='ngeeann') addNgeeAnn(group,p.x,p.z);
      else if (lm.kind==='orchardgateway') addOrchardGateway(group,p.x,p.z);
      else if (lm.kind==='jewel') addJewel(group,p.x,p.z);
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

  function addArtScience(group,x,z){
    const white=new THREE.MeshStandardMaterial({color:0xe2ddd2,roughness:.72}),base=new THREE.Mesh(new THREE.CylinderGeometry(11,14,5,14),white);base.position.set(x,2.5,z);group.add(base);
    for(let i=0;i<9;i++){
      const a=i*Math.PI*2/9,petal=new THREE.Mesh(new THREE.ConeGeometry(5.2,18,6),white);petal.position.set(x+Math.cos(a)*7.2,12,z+Math.sin(a)*7.2);petal.rotation.z=Math.PI*.42;petal.rotation.y=-a;group.add(petal);
    }
  }
  function addMerlion(group,x,z){
    const stone=new THREE.MeshStandardMaterial({color:0xe7e2d8,roughness:.82}),water=new THREE.MeshBasicMaterial({color:0x87c5dc,transparent:true,opacity:.72});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(2.6,3.2,1.2,10),stone);base.position.set(x,.6,z);group.add(base);
    const body=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.8,6.4,9),stone);body.position.set(x,4.3,z);group.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(1.55,10,8),stone);head.position.set(x,8.1,z+.15);group.add(head);
    const stream=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,7,6),water);stream.rotation.x=Math.PI/2;stream.position.set(x,7.7,z+4.4);group.add(stream);
  }
  function addSupertrees(group,x,z){
    const trunkMat=new THREE.MeshStandardMaterial({color:0x775b48,roughness:.88}),crownMat=new THREE.MeshStandardMaterial({color:0x607b59,emissive:0x16321f,emissiveIntensity:.14,roughness:.9});
    [[0,0,1.25],[-14,8,.9],[13,10,.95],[-10,-12,.82],[15,-9,.84]].forEach(([dx,dz,s])=>{
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(1.5,3.2,28*s,10),trunkMat);trunk.position.set(x+dx,14*s,z+dz);group.add(trunk);
      const crown=new THREE.Mesh(new THREE.CylinderGeometry(8.2*s,3.1*s,8*s,12,1,true),crownMat);crown.position.set(x+dx,29*s,z+dz);group.add(crown);
    });
  }
  function addMbfc(group,x,z){
    const glass=new THREE.MeshStandardMaterial({color:0x829aa5,roughness:.3,metalness:.12});
    [[-18,0,92,18,24],[9,-5,116,20,26],[30,7,84,18,22]].forEach(([dx,dz,h,w,d])=>{const t=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),glass);t.position.set(x+dx,h/2,z+dz);group.add(t);});
  }
  function addFullerton(group,x,z){
    const stone=new THREE.MeshStandardMaterial({color:0xd8ccb8,roughness:.82}),roof=new THREE.MeshStandardMaterial({color:0x777a76,roughness:.88});
    const body=new THREE.Mesh(new THREE.BoxGeometry(48,22,26),stone);body.position.set(x,11,z);group.add(body);
    const r=new THREE.Mesh(new THREE.ConeGeometry(18,9,4),roof);r.rotation.y=Math.PI/4;r.scale.x=1.55;r.position.set(x,26,z);group.add(r);
  }
  function addIon(group,x,z){
    const glass=new THREE.MeshStandardMaterial({color:0x667f8e,roughness:.26,metalness:.16}),pod=new THREE.MeshStandardMaterial({color:0xaaa9a5,roughness:.62});
    const podium=new THREE.Mesh(new THREE.CylinderGeometry(18,22,14,12),pod);pod.position.set(x,7,z);group.add(podium);
    const tower=new THREE.Mesh(new THREE.CylinderGeometry(9,13,88,10),glass);tower.position.set(x+5,58,z-3);tower.rotation.z=-.035;group.add(tower);
  }
  function addNgeeAnn(group,x,z){
    const stone=new THREE.MeshStandardMaterial({color:0xb88f78,roughness:.76}),dark=new THREE.MeshStandardMaterial({color:0x6e6a66,roughness:.7});
    const pod=new THREE.Mesh(new THREE.BoxGeometry(70,18,42),stone);pod.position.set(x,9,z);group.add(pod);
    [-22,22].forEach(dx=>{const tower=new THREE.Mesh(new THREE.BoxGeometry(20,60,24),stone);tower.position.set(x+dx,48,z);group.add(tower);const cap=new THREE.Mesh(new THREE.BoxGeometry(22,3,26),dark);cap.position.set(x+dx,79,z);group.add(cap);});
  }
  function addOrchardGateway(group,x,z){
    const glass=new THREE.MeshStandardMaterial({color:0x78909c,roughness:.28,metalness:.12});
    const a=new THREE.Mesh(new THREE.BoxGeometry(13,72,18),glass);a.position.set(x-11,36,z);group.add(a);
    const b=new THREE.Mesh(new THREE.BoxGeometry(13,58,18),glass);b.position.set(x+12,29,z+3);group.add(b);
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(24,4,7),glass);bridge.position.set(x,35,z+1);group.add(bridge);
  }
  function addJewel(group,x,z){
    const glass=new THREE.MeshStandardMaterial({color:0x8ca7ac,roughness:.28,metalness:.08,transparent:true,opacity:.86,side:THREE.DoubleSide});
    const dome=new THREE.Mesh(new THREE.SphereGeometry(52,28,12,0,Math.PI*2,0,Math.PI/2),glass);dome.scale.y=.34;dome.position.set(x,0,z);group.add(dome);
    const oculus=new THREE.Mesh(new THREE.TorusGeometry(5.2,.8,8,24),new THREE.MeshStandardMaterial({color:0x53686d,roughness:.5}));oculus.rotation.x=Math.PI/2;oculus.position.set(x,17.3,z);group.add(oculus);
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
        const seg={ax:points[i].x,az:points[i].z,bx:points[i+1].x,bz:points[i+1].z,width:idx<4?9.5:7,major:idx<4,lanes:2,type:idx<4?'primary':'residential',oneway:'',name:'DriveSG demo road',speedLimit:50};
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
    const fallbackColliders=boxes.map((b,i)=>({
      ...b,minHeight:0,bucket:0,distance:Math.hypot(b.x,b.z),
      pts:[{x:b.x-b.w/2,z:b.z-b.d/2},{x:b.x+b.w/2,z:b.z-b.d/2},{x:b.x+b.w/2,z:b.z+b.d/2},{x:b.x-b.w/2,z:b.z+b.d/2}],
      bounds:{minX:b.x-b.w/2,maxX:b.x+b.w/2,minZ:b.z-b.d/2,maxZ:b.z+b.d/2}
    }));
    const treeCount=addRoadsideTrees(group,segments,0,0,fallbackColliders);
    addLandmarksTo(group,0,0);
    return {group,segments,roadCount:roads.length,buildingCount:boxes.length,buildingColliders:fallbackColliders,waterPolygons:[],parkPolygons:[],treeCount};
  }

  function swapDynamicWorld(built) {
    const previous=dynamicWorld;
    dynamicWorld=built.group;
    scene.add(dynamicWorld);
    roadSegments=built.segments;
    roadGraph=built.roadGraph||buildRoadGraph(roadSegments);
    trafficSignalsWorld=built.signalDescriptors||[];
    buildingColliders=built.buildingColliders||[];
    currentWaterPolygons=built.waterPolygons||[];
    currentParkPolygons=built.parkPolygons||[];
    rebuildRoadIndex();
    rebuildBuildingIndex();
    createAmbientTraffic(dynamicWorld,roadSegments,roadGraph);
    if(navigation.active&&navigation.mode==='route')renderNavigationWorld();
    if(previous){scene.remove(previous);disposeWorldGroup(previous);}
    console.info(`DriveSG world: ${built.roadCount} road ways, ${built.buildingCount} buildings, ${built.trafficSignalCount||0} traffic signals, ${built.streetLightCount||0} street lights, ${built.treeCount||0} trees, ${built.segments.length} road segments`);
  }

  function disposeWorldGroup(group) {
    const retained = new Set([shared.sidewalk,shared.roadEdge,shared.road,shared.majorRoad,shared.line,shared.median,shared.bridge,shared.tunnel,shared.water,shared.park,shared.windows,shared.storefront,shared.treeTrunk,shared.treeLeaf,shared.signalPole,shared.signalHead,shared.signalRed,shared.signalAmber,shared.signalGreen,shared.busStopPole,shared.busStopSign,shared.streetPole,shared.streetLamp,shared.gantryPole,shared.gantrySign,trafficMaterial,...shared.buildings]);
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

  function rebuildBuildingIndex() {
    buildingIndex=new Map();
    const cell=120;
    for(const b of buildingColliders){
      const q=b.bounds;
      const minX=Math.floor(q.minX/cell),maxX=Math.floor(q.maxX/cell),minZ=Math.floor(q.minZ/cell),maxZ=Math.floor(q.maxZ/cell);
      for(let gx=minX;gx<=maxX;gx++)for(let gz=minZ;gz<=maxZ;gz++){
        const key=`${gx},${gz}`;
        if(!buildingIndex.has(key))buildingIndex.set(key,[]);
        buildingIndex.get(key).push(b);
      }
    }
  }

  function carHitsBuilding(x,z,y=carRoadY) {
    const cell=120,gx=Math.floor(x/cell),gz=Math.floor(z/cell);
    const candidates=buildingIndex.get(`${gx},${gz}`)||[];
    for(const b of candidates){
      if(y+1.45<b.minHeight||y>b.h+.5)continue;
      const q=b.bounds;
      if(x<q.minX-.9||x>q.maxX+.9||z<q.minZ-.9||z>q.maxZ+.9)continue;
      if(pointInPolygonXZ(x,z,b.pts))return true;
    }
    return false;
  }

  function pointInPolygonXZ(x,z,pts) {
    let inside=false;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const a=pts[i],b=pts[j];
      const crosses=((a.z>z)!==(b.z>z))&&(x<(b.x-a.x)*(z-a.z)/((b.z-a.z)||1e-9)+a.x);
      if(crosses)inside=!inside;
    }
    return inside;
  }

  function carHitsWater(x,z,y=carRoadY){
    if(y>1.5)return false;
    for(const pts of currentWaterPolygons){
      if(!pts?.length)continue;let q=pts._bounds;
      if(!q){let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}q=pts._bounds={minX,maxX,minZ,maxZ};}
      if(x<q.minX||x>q.maxX||z<q.minZ||z>q.maxZ)continue;if(pointInPolygonXZ(x,z,pts))return true;
    }
    return false;
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
    let best=null,bestScore=Infinity;
    for(const seg of candidates){
      const hit=closestPointOnSegment(x,z,seg),vertical=Math.abs(segmentYAt(seg,hit.t)-carRoadY),score=hit.dist+vertical*1.45;
      if(score<bestScore){bestScore=score;best={...hit,seg,score};}
    }
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
    carRoadY=segmentYAt(seg,best.t);
    car.position.set(px,.07+carRoadY,pz);
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

    const accel=7.0*(1-wetness*.05);
    const brakeForce=15.8*(1-wetness*.14);
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
    const steerLimit=THREE.MathUtils.lerp(.46,.17,Math.min(absSpeed/33,1))*(1-wetness*.07);
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

    if(carHitsBuilding(car.position.x,car.position.z,carRoadY)||carHitsTraffic(car.position.x,car.position.z,carRoadY)||carHitsWater(car.position.x,car.position.z,carRoadY)){
      car.position.x=beforeX;
      car.position.z=beforeZ;
      speedMps*=-.08;
    }

    const elevationHit=nearestRoadHit(car.position.x,car.position.z,false);
    const elevationTarget=elevationHit&&elevationHit.dist<elevationHit.seg.width/2+4?segmentYAt(elevationHit.seg,elevationHit.t):0;
    carRoadY+=(elevationTarget-carRoadY)*Math.min(1,dt*(elevationTarget>carRoadY?2.2:1.45));
    car.position.y=.07+carRoadY;

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
      const limit=onRoad?(hit?.seg?.speedLimit||null):null;
      if(limit!==lastSpeedLimit){
        lastSpeedLimit=limit;
        if(els.speedLimit){
          els.speedLimit.classList.toggle('hidden',!limit);
          if(limit)els.speedLimit.textContent=String(limit);
        }
      }
    }

    const speedKmh=Math.round(absSpeed*3.6);
    sessionTopSpeedKmh=Math.max(sessionTopSpeedKmh,speedKmh);
    els.speed.textContent=speedKmh;
    els.gear.textContent=speedMps<-.25?'R':'D';
    document.querySelector('.drive-hud')?.classList.toggle('speeding',Boolean(lastSpeedLimit&&speedKmh>lastSpeedLimit+5));
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

    const sunProgress=THREE.MathUtils.clamp((lightingSunHour-6)/13,0,1),sunAngle=sunProgress*Math.PI,azimuth=(lightingSunHour/24)*Math.PI*2+.7;
    const sunHeight=Math.max(28,Math.sin(sunAngle)*190),sunRadius=155;
    sun.position.set(car.position.x+Math.cos(azimuth)*sunRadius,sunHeight,car.position.z+Math.sin(azimuth)*sunRadius);
    sunTarget.position.set(car.position.x,0,car.position.z);
    if(horizonHaze){horizonHaze.position.x=car.position.x;horizonHaze.position.z=car.position.z;}
  }

  function maybeStreamWorld(elapsed) {
    if(mapMode!=='live'||streamBusy||elapsed-lastStreamAttempt<STREAM_RETRY_SECONDS)return;
    const dist=Math.hypot(car.position.x-loadedCenterWorld.x,car.position.z-loadedCenterWorld.z);
    if(dist<STREAM_TRIGGER_METERS)return;
    const fx=Math.sin(car.rotation.y),fz=Math.cos(car.rotation.y),lead=145+Math.min(95,Math.abs(speedMps)*3.1);
    const centerX=car.position.x+fx*lead,centerZ=car.position.z+fz*lead,coords=unproject(centerX,centerZ);
    if(!insideSingapore(coords.lat,coords.lon))return;
    lastStreamAttempt=elapsed;
    streamAroundCar(coords,centerX,centerZ);
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

  function maybePrefetchRouteAhead(elapsed){
    if(routePrefetchBusy||streamBusy||navigation.mode!=='route'||!navigation.active||navigation.routeCoords.length<2||elapsed-lastRoutePrefetch<ROUTE_PREFETCH_INTERVAL)return;
    const target=Math.min(navigation.totalM,navigation.progressM+ROUTE_PREFETCH_METERS);let idx=navigation.cumulativeM.findIndex(v=>v>=target);if(idx<0)idx=navigation.routeCoords.length-1;
    const c=navigation.routeCoords[idx];if(!c||!insideSingapore(c.lat,c.lon))return;
    lastRoutePrefetch=elapsed;routePrefetchBusy=true;
    fetchOsmData(c.lat,c.lon).catch(()=>{}).finally(()=>{routePrefetchBusy=false;});
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),.045);
    const elapsed=clock.elapsedTime;
    maybeRefreshEnvironment(elapsed);
    maybeRefreshLiveTraffic(elapsed);
    updateWeatherEffects(dt);
    updateWorldLighting(dt,elapsed);
    updateSignalVisual(elapsed);
    updateAmbientTraffic(dt,elapsed);
    updateCar(dt,elapsed);
    updateNavigation(elapsed);
    updateCamera(dt);
    maybeStreamWorld(elapsed);
    maybePrefetchRouteAhead(elapsed);
    paintMiniMap(elapsed);
    updateEngineAudio();
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
      const btn=document.createElement('button');btn.type='button';btn.className='preset';btn._place=place;
      btn.innerHTML=`<strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.subtitle)}</span>`;
      btn.addEventListener('click',()=>handlePlaceChoice(place));
      els.presetGrid.appendChild(btn);
    });
    refreshPresetDistances();
  }

  function refreshPresetDistances() {
    const here=currentCarCoords();
    [...els.presetGrid.children].forEach(btn=>{
      const p=btn._place,span=btn.querySelector('span');if(!p||!span)return;
      const d=haversineMeters(here.lat,here.lon,p.lat,p.lon);
      span.textContent=`${p.subtitle} · ≈${formatDistance(d)}`;
    });
  }

  function bindUi() {
    els.placesBtn.addEventListener('click',()=>setPanelOpen(!els.placesPanel.classList.contains('open')));
    els.closePanelBtn.addEventListener('click',closePanel);
    els.resetBtn.addEventListener('click',resetCar);
    els.lightingBtn?.addEventListener('click',cycleLightingMode);
    els.soundBtn.addEventListener('click',toggleEngineSound);
    els.cancelNavBtn.addEventListener('click',()=>clearNavigation());
    els.navigateModeBtn.addEventListener('click',()=>setPlaceMode('navigate'));
    els.startModeBtn.addEventListener('click',()=>setPlaceMode('start'));
    els.mapExpandBtn.addEventListener('click',e=>{e.stopPropagation();toggleMiniMapExpanded();});
    els.miniMapCanvas.addEventListener('click',()=>toggleMiniMapExpanded());
    els.mapOrientationBtn.addEventListener('click',e=>{
      e.stopPropagation();
      miniMapHeadingUp=!miniMapHeadingUp;
      els.mapOrientationBtn.textContent=miniMapHeadingUp?'↗':'N';
      try{localStorage.setItem('drivesg-map-heading-up',miniMapHeadingUp?'1':'0');}catch(_){}
      lastMiniMapPaint=-Infinity;
    });
    els.randomBtn.addEventListener('click',()=>handlePlaceChoice(PRESETS[Math.floor(Math.random()*PRESETS.length)]));
    els.nearMeBtn.addEventListener('click',useCurrentLocation);

    els.searchForm.addEventListener('submit',async e=>{
      e.preventDefault();
      const q=els.searchInput.value.trim();if(!q)return;
      const exact=PRESETS.find(p=>p.name.toLowerCase().includes(q.toLowerCase())||q.toLowerCase().includes(p.name.toLowerCase()));
      if(exact)return handlePlaceChoice(exact);
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
    if(open&&miniMapExpanded)toggleMiniMapExpanded();
    if(open){setPlaceMode(placeMode);buildRecentDestinations();refreshPresetDistances();}
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
        handlePlaceChoice({name:'My location',subtitle:'Current location',lat,lon});
      },
      ()=>{els.searchMsg.textContent='Safari did not provide your location. You can pick a place below instead.';},
      {enableHighAccuracy:false,timeout:9000,maximumAge:120000}
    );
  }

  async function searchSingapore(query) {
    const key=query.trim().toLowerCase();
    els.searchMsg.textContent='Searching Singapore…';
    try{
      let place=geocodeCache.get(key);
      if(!place){
        const controller=new AbortController();
        const timeoutId=setTimeout(()=>controller.abort(),9000);
        try{
          if(BACKEND_ACTIVE){
            const res=await fetch(`${BACKEND_BASE}/api/geocode?q=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'},signal:controller.signal});
            if(res.ok){const data=await res.json();const lat=Number(data.lat),lon=Number(data.lon);if(insideSingapore(lat,lon))place={name:data.name||query,subtitle:data.subtitle||'Search result',lat,lon};}
          }
          if(!place){
            const url=`${GEOCODE_ENDPOINT}?format=jsonv2&limit=1&countrycodes=sg&accept-language=en&q=${encodeURIComponent(query+', Singapore')}`;
            const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
            if(!res.ok)throw new Error(`Search ${res.status}`);
            const results=await res.json();if(!results.length)throw new Error('No match');
            const lat=Number(results[0].lat),lon=Number(results[0].lon);if(!insideSingapore(lat,lon))throw new Error('Outside Singapore');
            const label=(results[0].display_name||query).split(',')[0];
            place={name:label,subtitle:'Search result',lat,lon};
          }
        }finally{clearTimeout(timeoutId);}
        geocodeCache.set(key,place);while(geocodeCache.size>30)geocodeCache.delete(geocodeCache.keys().next().value);
      }
      els.searchMsg.textContent='';
      handlePlaceChoice(place);
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
