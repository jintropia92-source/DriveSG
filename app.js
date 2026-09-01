(() => {
  'use strict';

  const BUILD_ID = '20260901toa2';
  const SG_BOUNDS = { minLat: 1.3270, maxLat: 1.3425, minLon: 103.8420, maxLon: 103.8595 }; // compact Toa Payoh core only
  const CONFIG = window.DRIVESG_CONFIG || {};
  const OVERPASS_ENDPOINTS = Array.isArray(CONFIG.overpassEndpoints) && CONFIG.overpassEndpoints.length
    ? CONFIG.overpassEndpoints
    : ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  // External data providers are kept configurable so a managed/private backend can replace public demo services
  // without rewriting the driving, navigation or UI layers.
  const GEOCODE_ENDPOINT = CONFIG.geocodeEndpoint || 'https://nominatim.openstreetmap.org/search';
  const BACKEND_BASE = String(CONFIG.backendBase || '').replace(/\/$/, '');
  const BACKEND_ACTIVE = Boolean(BACKEND_BASE);
  const BACKEND_CIRCUIT_SECONDS = 45;
  const ONEMAP_TILE_BASES = {
    day:'https://www.onemap.gov.sg/maps/tiles/Default',
    night:'https://www.onemap.gov.sg/maps/tiles/Night'
  };
  const ELEVATION_ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
  const TERRAIN_GRID_SIZE = 7;
  const TERRAIN_SPAN_METERS = 2400;
  const ONEMAP_MIN_ZOOM = 11;
  const ONEMAP_MAX_ZOOM = 19;
  const ONEMAP_TILE_SIZE = 256;
  const ENVIRONMENT_REFRESH_SECONDS = 240;
  const TRAFFIC_REFRESH_SECONDS = 75;
  const ROUTE_OFFTRACK_METERS = 52;
  const ROUTE_REROUTE_COOLDOWN = 11;
  const ARRIVAL_METERS = 24;
  const NAV_UPDATE_SECONDS = .14;
  const ROUTE_PREFETCH_METERS = 520;
  const ROUTE_PREFETCH_INTERVAL = 12;
  const MAX_BUILDING_WINDOWS = 24000;
  const MAX_FACADE_BUILDINGS = 850;
  const MAX_FACADE_DETAILS = 16000;
  const MAX_ROAD_NAME_SIGNS = 22;
  const MAX_TROPICAL_PLANTS = 240;
  const MAX_STREET_LIGHTS = 230;
  const BRIDGE_BASE_HEIGHT = 5.4;
  const PERFORMANCE_TARGET_FPS = 50;
  const GRAPHICS_TIER_COOLDOWN = 8;
  const RAIN_PARTICLES_HIGH = 760;
  const RAIN_PARTICLES_BALANCED = 520;
  const RAIN_PARTICLES_PERFORMANCE = 300;

  const PRESETS = [
    { name: 'Town Centre', subtitle: 'HDB Hub & Toa Payoh Mall', lat: 1.33220, lon: 103.84810 },
    { name: 'Dragon Playground', subtitle: 'Lorong 6', lat: 1.33194, lon: 103.85439 },
    { name: 'Town Park', subtitle: 'Lookout tower & gardens', lat: 1.33058, lon: 103.84788 },
    { name: 'Shuang Lin Monastery', subtitle: 'Jalan Toa Payoh', lat: 1.33028, lon: 103.85750 },
    { name: 'Central Horizon', subtitle: 'Golden-crown blocks', lat: 1.33465, lon: 103.84846 },
    { name: 'VIP Block 53', subtitle: 'Lorong 5', lat: 1.33780, lon: 103.85079 }
  ];

  const CHALLENGES = []; // focused prototype uses relaxed local drives only

  const DISCOVERY_ZONES = [
    {id:'town-centre',name:'Town Centre',lat:1.3322,lon:103.8487,radius:430,tagline:'The heart of Toa Payoh',text:'HDB Hub, shops and the town-centre streets sit at the core.',tip:'Watch the short junctions and bus-stop lanes.'},
    {id:'lorong-west',name:'Lorong 1 & 2',lat:1.3332,lon:103.8448,radius:520,tagline:'Older HDB streets',text:'Curved and slab blocks make this side of Toa Payoh feel distinctly old-school.',tip:'Residential roads are narrower and calmer.'},
    {id:'lorong-east',name:'Lorong 5 & 6',lat:1.3341,lon:103.8530,radius:620,tagline:'Classic heartland',text:'Iconic early HDB blocks, playgrounds and everyday neighbourhood roads.',tip:'Slow down around local junctions and service roads.'},
    {id:'north',name:'Toa Payoh North',lat:1.3402,lon:103.8488,radius:560,tagline:'Quieter residential edge',text:'Greener streets and mature housing lead toward Braddell.',tip:'The road rhythm becomes more residential here.'}
  ];

  const GUIDED_DRIVES = [
    {id:'first-drive',name:'First Drive',kicker:'BEST START',duration:'5–8 min',summary:'Town Centre → Town Park → Dragon Playground.',
      start:{name:'Town Centre',lat:1.33205,lon:103.84850},finish:{name:'Dragon Playground',lat:1.33194,lon:103.85439},
      via:[{lat:1.33058,lon:103.84788},{lat:1.3309,lon:103.8518}],highlights:['hdbhub','townpark','dragon']},
    {id:'heritage-loop',name:'Heritage Drive',kicker:'OLD TOA PAYOH',duration:'8–12 min',summary:'VIP Block → Town Centre → Dragon Playground → Shuang Lin.',
      start:{name:'VIP Block 53',lat:1.33780,lon:103.85079},finish:{name:'Shuang Lin Monastery',lat:1.33028,lon:103.85750},
      via:[{lat:1.3331,lon:103.8449},{lat:1.33239,lon:103.84743},{lat:1.33194,lon:103.85439}],highlights:['vip53','block157','toapayohmall','dragon','shuanglin']},
    {id:'heartland-loop',name:'Heartland Loop',kicker:'EVERYDAY STREETS',duration:'6–9 min',summary:'Central Horizon → Lorong 1 → Town Park → Town Centre.',
      start:{name:'Central Horizon',lat:1.33465,lon:103.84846},finish:{name:'Town Centre',lat:1.33205,lon:103.84850},
      via:[{lat:1.33180,lon:103.84490},{lat:1.33058,lon:103.84788}],highlights:['centralhorizon','block157','townpark','hdbhub']}
  ];

  const LANDMARK_INFO = {
    hdbhub:{text:'The town-centre anchor.',note:''},
    dragon:{text:'Toa Payoh’s iconic mosaic dragon playground.',note:''},
    townpark:{text:'A green landmark beside the town centre.',note:''},
    vip53:{text:'The distinctive Y-shaped early HDB block.',note:''},
    block157:{text:'A long curved HDB block from the early town.',note:''},
    centralhorizon:{text:'Five tall blocks with distinctive crown forms.',note:''},
    toapayohmall:{text:'The familiar town-centre pedestrian mall and yellow gateway.',note:''},
    shuanglin:{text:'A historic Buddhist monastery with traditional roofs and a seven-storey pagoda.',note:''}
  };

  const VISUAL_PROFILES = {
    default:{accent:'#a9e7b2',accent2:'#8ecded',skyWarm:'#9cb8a7',building:0xcdcabd,glass:0x78929c,green:0x587d57},
    'town-centre':{accent:'#b8efbe',accent2:'#8fcde9',skyWarm:'#a1b7a8',building:0xd0cabb,glass:0x718b98,green:0x5b7d59},
    'lorong-west':{accent:'#e9d39b',accent2:'#9bcad8',skyWarm:'#b3a995',building:0xd6cbb5,glass:0x788d93,green:0x607a55},
    'lorong-east':{accent:'#e6b79c',accent2:'#93d6c2',skyWarm:'#b5a499',building:0xd4c4b5,glass:0x748d95,green:0x5d7d55},
    north:{accent:'#a7dfae',accent2:'#9bcce8',skyWarm:'#9fb4a5',building:0xcbc9bb,glass:0x76909a,green:0x557b58}
  };

  const LANDMARKS = [
    { name: 'HDB Hub', lat: 1.33199, lon: 103.84848, kind: 'hdbhub' },
    { name: 'Dragon Playground', lat: 1.33194, lon: 103.85439, kind: 'dragon' },
    { name: 'Toa Payoh Town Park', lat: 1.33058, lon: 103.84788, kind: 'townpark' },
    { name: 'VIP Block 53', lat: 1.33780, lon: 103.85079, kind: 'vip53' },
    { name: 'Block 157', lat: 1.33180, lon: 103.84490, kind: 'block157' },
    { name: 'Central Horizon', lat: 1.33465, lon: 103.84846, kind: 'centralhorizon' },
    { name: 'Toa Payoh Mall', lat: 1.33239, lon: 103.84743, kind: 'toapayohmall' },
    { name: 'Lian Shan Shuang Lin Monastery', lat: 1.33028, lon: 103.85750, kind: 'shuanglin' }
  ];

  const LANDMARK_REPLACEMENT_RADII = {
    hdbhub:44, dragon:18, townpark:34, vip53:34, block157:46,
    centralhorizon:62, toapayohmall:42, shuanglin:58
  };

  const LANDMARK_COLLIDER_SPECS = {
    hdbhub:{w:54,d:36,h:92},
    dragon:{w:26,d:16,h:10},
    vip53:{w:28,d:30,h:72},
    block157:{w:62,d:48,h:36},
    centralhorizon:{w:72,d:28,h:92},
    toapayohmall:{w:42,d:28,h:12},
    shuanglin:{w:56,d:42,h:30}
  };

  function insideCustomLandmarkFootprint(x,z){
    for(const lm of LANDMARKS){
      const r=LANDMARK_REPLACEMENT_RADII[lm.kind]||0;if(!r)continue;
      const p=project(lm.lat,lm.lon);
      if(Math.hypot(x-p.x,z-p.z)<r)return true;
    }
    return false;
  }

  const ROAD_WIDTHS = {
    motorway: 12.5, motorway_link: 8.5, trunk: 11.5, trunk_link: 8.2,
    primary: 10.5, primary_link: 8, secondary: 8.8, secondary_link: 7.2,
    tertiary: 7.6, tertiary_link: 6.6, residential: 6.2, unclassified: 6,
    living_street: 5.4, service: 5, road: 5
  };

  const ROAD_QUERY = '^(primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$';
  const STREAM_TRIGGER_METERS = 99999; // focused town build loads once; no background world swaps
  const STREAM_RETRY_SECONDS = 13;
  const ROAD_RADIUS_METERS = 2200;
  const BUILDING_RADIUS_METERS = 1450;
  const SURFACE_RADIUS_METERS = 1550;
  const MAX_BUILDINGS = 1500;
  const SIGNAL_RADIUS_METERS = 1550;
  const MAX_TRAFFIC_SIGNALS = 140;
  const MAX_CROSSINGS = 140;
  const MAX_BUS_STOPS = 90;
  const MAX_AMBIENT_TRAFFIC = 26;
  const TRAFFIC_SIGNAL_CYCLE_SECONDS = 32;
  const TRAFFIC_LANE_CHANGE_SECONDS = 1.05;
  const TRAFFIC_MIN_GAP_METERS = 4.6;
  const TRAFFIC_BUS_DWELL_SECONDS = 4.5;
  const MINI_MAP_RANGE_DEFAULT = 360;
  const ENGINE_IDLE_RPM = 860;
  const ENGINE_REDLINE_RPM = 6500;
  const TRANSMISSION_GEARS = 6;
  const TRANSMISSION_UP_KMH = [0,24,45,69,94,116];
  const TRANSMISSION_DOWN_KMH = [0,0,16,34,55,79,102];
  const TRANSMISSION_RPM_PER_KMH = [151,96,67,51,42,35];
  const SHIFT_DURATION_SECONDS = .19;

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
  let qualityPixelRatio = Math.min(window.devicePixelRatio || 1, 1.68);
  let basePixelRatio = qualityPixelRatio;
  let graphicsTier = 'high';
  let fpsSmoothed = 60;
  let qualityLowWindows = 0;
  let qualityHighWindows = 0;
  let lastGraphicsTierChange = -Infinity;
  let lastShaderWarmup = -Infinity;
  let backendFailureCount = 0;
  let backendCircuitUntil = 0;
  let guardsInstalled = false;
  let mapMode = 'live';
  let sessionDistanceM = 0;
  let sessionTopSpeedKmh = 0;
  let reverseHold = 0;
  let reverseEngaged = false;
  let driveGear = 1;
  let engineRpm = 900;
  let engineLoad = 0;
  let shiftTimer = 0;
  let lastShiftAt = -Infinity;
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
  let busStopsWorld = [];
  let trafficSignalVisuals = null;
  let lastSignalVisualUpdate = -Infinity;
  let userSignalTracker = { key:'', distance:Infinity, violatedAt:-Infinity };
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
  let inTunnel = false;
  let trafficDataBusy = false;
  let lastTrafficDataRefresh = -Infinity;
  let liveTrafficBands = [];
  let liveTrafficIncidents = [];
  let lastIncidentToastKey = '';
  const mapCache = new Map();
  const geocodeCache = new Map();
  const oneMapTileCache = new Map();
  let oneMapTilesEnabled = true;
  let oneMapTileFailures = 0;
  let challenge = makeEmptyChallenge();
  let lastChallengeId = '';
  let discoveryViewOpen = false;
  let guidedDrive = null;
  let guidedDriveCompleted = new Set();
  let discoverySeenSession = new Set();
  let discoveryCardTimer = null;
  let areaRibbonTimer = null;
  let lastDiscoveryCheck = -Infinity;
  let currentDiscoveryZoneId = '';
  let selectedHopPoint = {lat:PRESETS[0].lat,lon:PRESETS[0].lon,name:PRESETS[0].name};
  let hopMapPaintPending = false;
  let hopMapZoom = 16;
  let cameraLookYaw = 0;
  let cameraLookPitch = 0;
  let cameraLookActive = false;
  let cameraLookPointer = null;
  let cameraLookLast = {x:0,y:0};
  let activeTerrainPatch = null;
  const terrainPatchCache = new Map();
  // Driving-dynamics state. We keep the proven scalar forward-speed model but add
  // yaw inertia, lateral tyre slip and transient suspension/camera response around it.
  let lateralSlipMps = 0;
  let yawVelocity = 0;
  let tyreSlip = 0;
  let absActive = false;
  let tcsActive = false;
  let cameraMode = 'chase';
  let cameraShake = 0;
  let suspensionHeave = 0;
  let suspensionHeaveVel = 0;
  let lastPhysicsSpeedMps = 0;
  let lastElevationTarget = 0;
  let roadShock = 0;
  let skyDome = null, skyUniforms = null, sunDisc = null, moonDisc = null;
  let currentVisualProfileId = 'default';
  let journeyPostcardLast = null;

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
    cameraBtn: document.getElementById('cameraBtn'),
    weatherBadge: document.getElementById('weatherBadge'),
    weatherIcon: document.getElementById('weatherIcon'),
    weatherText: document.getElementById('weatherText'),
    nearMeBtn: document.getElementById('nearMeBtn'),
    randomBtn: document.getElementById('randomBtn'),
    randomBtnLabel: document.getElementById('randomBtnLabel'),
    navigateModeBtn: document.getElementById('navigateModeBtn'),
    startModeBtn: document.getElementById('startModeBtn'),
    challengeModeBtn: document.getElementById('challengeModeBtn'),
    placePicker: document.getElementById('placePicker'),
    challengeSection: document.getElementById('challengeSection'),
    challengeGrid: document.getElementById('challengeGrid'),
    challengeProgressLabel: document.getElementById('challengeProgressLabel'),
    discoverSingaporeBtn: document.getElementById('discoverSingaporeBtn'),
    hopMapBtn: document.getElementById('hopMapBtn'),
    discoverSection: document.getElementById('discoverSection'),
    discoverBackBtn: document.getElementById('discoverBackBtn'),
    passportProgress: document.getElementById('passportProgress'),
    passportBar: document.getElementById('passportBar'),
    guidedDriveGrid: document.getElementById('guidedDriveGrid'),
    areaRibbon: document.getElementById('areaRibbon'),
    areaRibbonEyebrow: document.getElementById('areaRibbonEyebrow'),
    areaRibbonTitle: document.getElementById('areaRibbonTitle'),
    areaRibbonText: document.getElementById('areaRibbonText'),
    discoveryCard: document.getElementById('discoveryCard'),
    discoveryCardClose: document.getElementById('discoveryCardClose'),
    discoveryKicker: document.getElementById('discoveryKicker'),
    discoveryTitle: document.getElementById('discoveryTitle'),
    discoveryText: document.getElementById('discoveryText'),
    discoveryDriveNote: document.getElementById('discoveryDriveNote'),
    hopMapOverlay: document.getElementById('hopMapOverlay'),
    hopMapCanvas: document.getElementById('hopMapCanvas'),
    hopMapCloseBtn: document.getElementById('hopMapCloseBtn'),
    hopMapPlaceName: document.getElementById('hopMapPlaceName'),
    hopMapCoords: document.getElementById('hopMapCoords'),
    hopNavigateBtn: document.getElementById('hopNavigateBtn'),
    hopStartBtn: document.getElementById('hopStartBtn'),
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
    gripIndicator: document.getElementById('gripIndicator'),
    absIndicator: document.getElementById('absIndicator'),
    tcsIndicator: document.getElementById('tcsIndicator'),
    signalIndicator: document.getElementById('signalIndicator'),
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
    navProgressBar: document.getElementById('navProgressBar'),
    cancelNavBtn: document.getElementById('cancelNavBtn'),
    miniMapCard: document.getElementById('miniMapCard'),
    miniMapCanvas: document.getElementById('miniMapCanvas'),
    miniMapFooter: document.getElementById('miniMapFooter'),
    compassLabel: document.getElementById('compassLabel'),
    mapOrientationBtn: document.getElementById('mapOrientationBtn'),
    mapExpandBtn: document.getElementById('mapExpandBtn'),
    routingCredit: document.getElementById('routingCredit'),
    challengeHud: document.getElementById('challengeHud'),
    challengeHudName: document.getElementById('challengeHudName'),
    challengeTimer: document.getElementById('challengeTimer'),
    challengeScore: document.getElementById('challengeScore'),
    challengeCountdown: document.getElementById('challengeCountdown'),
    challengeCountdownText: document.getElementById('challengeCountdownText'),
    challengeResult: document.getElementById('challengeResult'),
    challengeResultTitle: document.getElementById('challengeResultTitle'),
    challengeResultTime: document.getElementById('challengeResultTime'),
    challengeBestTime: document.getElementById('challengeBestTime'),
    challengeResultScore: document.getElementById('challengeResultScore'),
    challengeGrade: document.getElementById('challengeGrade'),
    challengeCollisions: document.getElementById('challengeCollisions'),
    challengeOffroad: document.getElementById('challengeOffroad'),
    challengeSpeeding: document.getElementById('challengeSpeeding'),
    challengeRedLights: document.getElementById('challengeRedLights'),
    challengeResultNote: document.getElementById('challengeResultNote'),
    challengeDoneBtn: document.getElementById('challengeDoneBtn'),
    challengeAgainBtn: document.getElementById('challengeAgainBtn'),
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
    toast: document.getElementById('toast'),
    speedFx: document.getElementById('speedFx'),
    speedVignette: document.getElementById('speedVignette'),
    rainGlass: document.getElementById('rainGlass'),
    shareBtn: document.getElementById('shareBtn'),
    creditsBtn: document.getElementById('creditsBtn'),
    creditsChip: document.getElementById('creditsChip'),
    creditsOverlay: document.getElementById('creditsOverlay'),
    creditsCloseBtn: document.getElementById('creditsCloseBtn'),
    journeyPostcard: document.getElementById('journeyPostcard'),
    journeyPostcardTitle: document.getElementById('journeyPostcardTitle'),
    journeyPostcardRoute: document.getElementById('journeyPostcardRoute'),
    journeyPostcardTime: document.getElementById('journeyPostcardTime'),
    journeyPostcardLandmarks: document.getElementById('journeyPostcardLandmarks'),
    journeyPostcardPassport: document.getElementById('journeyPostcardPassport'),
    journeyPostcardNote: document.getElementById('journeyPostcardNote'),
    journeyContinueBtn: document.getElementById('journeyContinueBtn'),
    journeyAnotherBtn: document.getElementById('journeyAnotherBtn')
  };

  async function init() {
    if (!window.THREE) return;
    installProductionGuards();
    buildPresetButtons();
    buildRecentDestinations();
    buildChallengeButtons();
    buildGuidedDriveButtons();
    updatePassportProgress();
    bindUi();
    try{
      miniMapHeadingUp=localStorage.getItem('drivesg-map-heading-up')!=='0';
      lightingMode=localStorage.getItem('drivesg-lighting-mode')||'auto';
      cameraMode=localStorage.getItem('drivesg-camera-mode')||'chase';
    }catch(_){}
    if(!['auto','day','dusk','night'].includes(lightingMode))lightingMode='auto';
    if(!['chase','hood','scenic'].includes(cameraMode))cameraMode='chase';
    els.mapOrientationBtn.textContent=miniMapHeadingUp?'↗':'N';
    updateLightingButton();
    updateCameraButton();
    setPlaceMode('navigate');
    initThree();
    initialiseGraphicsTier();
    createCar();
    createRainSystem();
    refreshProviderStatus();
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    els.game.appendChild(renderer.domElement);
    bindFreeLook(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost',e=>{
      e.preventDefault();
      recordDiagnostic('webgl-context-lost','WebGL context lost');
      clearInputs();
      showLoader('Graphics paused — recovering…',72);
    },false);
    renderer.domElement.addEventListener('webglcontextrestored',()=>{
      recordDiagnostic('webgl-context-restored','WebGL context restored');
      renderer.resetState?.();
      warmSceneShaders();
      setProgress(100,'Graphics recovered');
      setTimeout(hideLoader,320);
      showToast('Graphics recovered');
    },false);

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
    createSkyAtmosphere();

    makeSharedMaterials();
    applyDistrictVisualProfile('marina-bay');

    persistentWorld = new THREE.Group();
    scene.add(persistentWorld);

    const groundMat=shared.terrain.clone();
    if(shared.terrain.map){groundMat.map=shared.terrain.map.clone();groundMat.map.wrapS=groundMat.map.wrapT=THREE.RepeatWrapping;groundMat.map.repeat.set(2400,2400);groundMat.map.needsUpdate=true;}
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70000, 70000),
      groundMat
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

  function createSkyAtmosphere(){
    skyUniforms={
      topColor:{value:new THREE.Color(0x5d93ad)},
      horizonColor:{value:new THREE.Color(0xc6d6d8)},
      bottomColor:{value:new THREE.Color(0xe4d9c6)},
      horizonPower:{value:1.28}
    };
    const mat=new THREE.ShaderMaterial({
      uniforms:skyUniforms,side:THREE.BackSide,depthWrite:false,fog:false,
      vertexShader:`varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;uniform float horizonPower;varying vec3 vPos;void main(){float h=normalize(vPos).y;float upper=smoothstep(-0.03,0.72,h);float low=smoothstep(-0.42,0.02,h);vec3 c=mix(bottomColor,horizonColor,low);c=mix(c,topColor,pow(upper,horizonPower));gl_FragColor=vec4(c,1.0);}`
    });
    skyDome=new THREE.Mesh(new THREE.SphereGeometry(3200,32,20),mat);skyDome.renderOrder=-1000;scene.add(skyDome);
    const sunMat=new THREE.MeshBasicMaterial({color:0xffe4a3,transparent:true,opacity:.9,depthWrite:false,toneMapped:false});
    sunDisc=new THREE.Mesh(new THREE.SphereGeometry(13,18,12),sunMat);scene.add(sunDisc);
    const moonMat=new THREE.MeshBasicMaterial({color:0xe9f2f8,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
    moonDisc=new THREE.Mesh(new THREE.SphereGeometry(8,16,10),moonMat);scene.add(moonDisc);
  }

  function visualProfileFor(id=currentVisualProfileId){return VISUAL_PROFILES[id]||VISUAL_PROFILES.default;}

  function applyDistrictVisualProfile(id='default'){
    const next=VISUAL_PROFILES[id]?id:'default';if(next===currentVisualProfileId)return;
    currentVisualProfileId=next;const p=visualProfileFor(next);
    document.body.dataset.district=next;
    document.documentElement.style.setProperty('--drive-accent',p.accent);
    document.documentElement.style.setProperty('--drive-accent-2',p.accent2);
    if(shared.buildings?.[0])shared.buildings[0].color.setHex(p.building);
    if(shared.buildings?.[5])shared.buildings[5].color.copy(new THREE.Color(p.building).offsetHSL(.01,-.03,.08));
    if(shared.buildings?.[7])shared.buildings[7].color.copy(new THREE.Color(p.building).offsetHSL(-.02,.02,-.04));
    if(shared.buildings?.[4])shared.buildings[4].color.setHex(p.glass);
    if(shared.buildings?.[6])shared.buildings[6].color.copy(new THREE.Color(p.glass).offsetHSL(-.01,.03,-.09));
    if(shared.treeLeaf)shared.treeLeaf.color.setHex(p.green);
    if(shared.windows){shared.windows.emissive.copy(new THREE.Color(p.accent2).multiplyScalar(.16));shared.windows.color.copy(new THREE.Color(p.glass).offsetHSL(0,-.05,-.16));}
    if(shared.officeBand){shared.officeBand.emissive.copy(new THREE.Color(p.accent2).multiplyScalar(.11));shared.officeBand.color.copy(new THREE.Color(p.glass).offsetHSL(0,-.04,-.10));}
    if(shared.storefront)shared.storefront.emissive.copy(new THREE.Color(p.accent).multiplyScalar(.13));
    if(shared.treeLeafLight)shared.treeLeafLight.color.copy(new THREE.Color(p.green).offsetHSL(.015,.015,.06));
    if(shared.palmLeaf)shared.palmLeaf.color.copy(new THREE.Color(p.green).offsetHSL(-.01,.03,-.01));
  }

  function seededNoise(seed){
    const x=Math.sin(seed*12.9898+78.233)*43758.5453;return x-Math.floor(x);
  }

  function makeSurfaceTexture(kind='asphalt',size=256){
    const c=document.createElement('canvas');c.width=size;c.height=size;const g=c.getContext('2d',{alpha:false});if(!g)return null;
    const img=g.createImageData(size,size),d=img.data;
    const cfg={
      asphalt:{base:184,amp:25},concrete:{base:219,amp:17},facade:{base:226,amp:13},glass:{base:196,amp:18},grass:{base:185,amp:24}
    }[kind]||{base:210,amp:16};
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,n=(seededNoise(x*1.73+y*3.11)+seededNoise(x*.31+y*.67)*.55-0.78);
      let v=cfg.base+n*cfg.amp;
      if(kind==='asphalt')v+=Math.sin(x*.23+y*.17)*2.2;
      if(kind==='glass')v+=Math.sin(x*.095)*5+Math.sin(y*.021)*2;
      if(kind==='facade')v+=Math.sin(y*.12)*1.8;
      if(kind==='grass')v+=Math.sin(x*.14)*3+Math.sin(y*.19)*2;
      v=Math.max(35,Math.min(250,v));d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;
    }
    g.putImageData(img,0,0);
    if(kind==='asphalt'){
      g.globalAlpha=.16;g.strokeStyle='#50545a';g.lineWidth=1;
      for(let i=0;i<18;i++){const x=seededNoise(i*4.7)*size,y=seededNoise(i*7.9+2)*size;g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+8,y+4,x-5,y+17,x+14,y+25);g.stroke();}
      g.globalAlpha=.12;g.fillStyle='#d0d0cc';for(let i=0;i<170;i++){const x=seededNoise(i*11.3)*size,y=seededNoise(i*8.2+9)*size,r=.35+seededNoise(i*2.1)*.8;g.fillRect(x,y,r,r);}
    }else if(kind==='concrete'){
      g.globalAlpha=.14;g.strokeStyle='#81817d';g.lineWidth=1;for(let p=64;p<size;p+=64){g.beginPath();g.moveTo(p,0);g.lineTo(p,size);g.stroke();g.beginPath();g.moveTo(0,p);g.lineTo(size,p);g.stroke();}
    }else if(kind==='facade'){
      g.globalAlpha=.10;g.strokeStyle='#8c8c88';for(let x=32;x<size;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,size);g.stroke();}
    }else if(kind==='glass'){
      g.globalAlpha=.13;g.fillStyle='#dbe5e8';for(let x=8;x<size;x+=38)g.fillRect(x,0,2,size);
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
    if(renderer?.capabilities?.getMaxAnisotropy)t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate=true;return t;
  }

  function applyWorldUv(geometry,scale=.1){
    const pos=geometry.attributes?.position?.array;if(!pos||pos.length<9)return;
    const uv=new Float32Array((pos.length/3)*2);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),n=new THREE.Vector3();
    for(let i=0;i<pos.length;i+=9){
      a.set(pos[i],pos[i+1],pos[i+2]);b.set(pos[i+3],pos[i+4],pos[i+5]);c.set(pos[i+6],pos[i+7],pos[i+8]);
      ab.subVectors(b,a);ac.subVectors(c,a);n.crossVectors(ab,ac).normalize();
      const ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
      for(let k=0;k<3;k++){
        const p=i+k*3,ui=(p/3)*2,x=pos[p],y=pos[p+1],z=pos[p+2];
        if(ay>.62){uv[ui]=x*scale;uv[ui+1]=z*scale;}
        else if(ax>az){uv[ui]=z*scale;uv[ui+1]=y*scale;}
        else{uv[ui]=x*scale;uv[ui+1]=y*scale;}
      }
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  }

  function makeSharedMaterials() {
    const asphaltTex=makeSurfaceTexture('asphalt'),concreteTex=makeSurfaceTexture('concrete'),facadeTex=makeSurfaceTexture('facade'),glassTex=makeSurfaceTexture('glass'),grassTex=makeSurfaceTexture('grass');
    shared.sidewalk = new THREE.MeshStandardMaterial({ color: 0xa7a59e, map:concreteTex, roughness: .96, metalness: 0, side: THREE.DoubleSide });shared.sidewalk.userData.uvScale=.18;
    shared.roadEdge = new THREE.MeshStandardMaterial({ color: 0x737773, map:asphaltTex, roughness: .98, metalness: 0, side: THREE.DoubleSide });shared.roadEdge.userData.uvScale=.16;
    shared.road = new THREE.MeshStandardMaterial({ color: 0x3c4145, map:asphaltTex, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });shared.road.userData.uvScale=.16;
    shared.majorRoad = new THREE.MeshStandardMaterial({ color: 0x31363a, map:asphaltTex, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });shared.majorRoad.userData.uvScale=.16;
    shared.line = new THREE.MeshBasicMaterial({ color: 0xf0ead7, transparent: true, opacity: 0.86, depthWrite: false, side: THREE.DoubleSide });
    shared.median = new THREE.MeshStandardMaterial({ color: 0x697665, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    shared.bridge = new THREE.MeshStandardMaterial({ color: 0x6f7577, roughness: .92, metalness: .04, side: THREE.DoubleSide });
    shared.tunnel = new THREE.MeshStandardMaterial({ color: 0x2d3437, roughness: .94, metalness: 0, side: THREE.DoubleSide });
    shared.tunnelLight = new THREE.MeshStandardMaterial({ color: 0xfff2c9, emissive: 0xffd98a, emissiveIntensity: 3.2, roughness: .32, metalness: .05 });
    shared.roadStud = new THREE.MeshStandardMaterial({ color: 0xf8f4df, emissive: 0xbcc8c1, emissiveIntensity: .58, roughness: .42 });
    shared.water = new THREE.MeshStandardMaterial({ color: 0x527d8d, roughness: 0.72, metalness: 0.03, transparent: true, opacity: 0.93, side: THREE.DoubleSide });
    shared.park = new THREE.MeshStandardMaterial({ color: 0x728a70, map:grassTex, roughness: 1, metalness: 0, side: THREE.DoubleSide });shared.park.userData.uvScale=.09;
    shared.terrain = new THREE.MeshStandardMaterial({ color: 0x7b876f, map:grassTex, roughness: 1, metalness: 0, side: THREE.DoubleSide });shared.terrain.userData.uvScale=.08;
    shared.buildings = [
      new THREE.MeshStandardMaterial({ color: 0xcac3b6, map:facadeTex, roughness: 0.86, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xbfc8ca, map:facadeTex, roughness: 0.76, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xa6aaa9, map:facadeTex, roughness: 0.92, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xd5cdbd, map:facadeTex, roughness: 0.89, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x94a9b3, map:glassTex, roughness: 0.25, metalness: .10, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xd7d4c9, map:facadeTex, roughness: 0.88, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x718892, map:glassTex, roughness: 0.22, metalness: .13, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xb9afa2, map:facadeTex, roughness: 0.84, side: THREE.DoubleSide })
    ];
    shared.buildings.forEach((m,i)=>m.userData.uvScale=(i===4||i===6)?.060:.085);
    shared.rooftop = new THREE.MeshStandardMaterial({color:0x777d7d,map:concreteTex,roughness:.82,metalness:.04,side:THREE.DoubleSide});shared.rooftop.userData.uvScale=.16;
    shared.curb = new THREE.MeshStandardMaterial({color:0xd8d6cf,map:concreteTex,roughness:.92,metalness:0,side:THREE.DoubleSide});shared.curb.userData.uvScale=.22;
    shared.windows = new THREE.MeshStandardMaterial({ color: 0x314650, map:glassTex, emissive: 0x14232d, emissiveIntensity: .08, roughness: .22, metalness: .10, side: THREE.DoubleSide });shared.windows.userData.uvScale=.09;
    shared.storefront = new THREE.MeshStandardMaterial({ color: 0x395967, emissive: 0x20343e, emissiveIntensity: .12, roughness: .24, metalness: .10, side: THREE.DoubleSide });
    shared.hdbCorridor = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: .84, metalness: 0, side: THREE.DoubleSide });
    shared.officeBand = new THREE.MeshStandardMaterial({ color: 0x496875, map:glassTex, emissive: 0x152833, emissiveIntensity: .06, roughness: .23, metalness: .12, side: THREE.DoubleSide });shared.officeBand.userData.uvScale=.075;
    shared.awning = new THREE.MeshStandardMaterial({ color: 0x8f4f42, roughness: .78, metalness: 0, side: THREE.DoubleSide });
    shared.markingYellow = new THREE.MeshBasicMaterial({ color: 0xe8ca58, transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide });
    shared.islandKerb = new THREE.MeshStandardMaterial({ color: 0xe0dfd7, roughness: .9, metalness: 0, side: THREE.DoubleSide });
    shared.treeTrunk = new THREE.MeshStandardMaterial({ color: 0x625341, roughness: 1 });
    shared.treeLeaf = new THREE.MeshStandardMaterial({ color: 0x567459, roughness: 1 });
    shared.treeLeafLight = new THREE.MeshStandardMaterial({ color: 0x668668, roughness: 1 });
    shared.palmLeaf = new THREE.MeshStandardMaterial({ color: 0x4f7354, roughness: .94, side: THREE.DoubleSide });
    shared.signalPole = new THREE.MeshStandardMaterial({ color: 0x3d4142, roughness: .92 });
    shared.signalHead = new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: .82 });
    shared.signalRed = new THREE.MeshStandardMaterial({ color: 0x8e2c2f, emissive: 0x250506, emissiveIntensity: .55, roughness: .65 });
    shared.signalAmber = new THREE.MeshStandardMaterial({ color: 0xa98131, emissive: 0x211404, emissiveIntensity: .32, roughness: .65 });
    shared.signalGreen = new THREE.MeshStandardMaterial({ color: 0x3d7c57, emissive: 0x061d0e, emissiveIntensity: .32, roughness: .65 });
    shared.busStopPole = new THREE.MeshStandardMaterial({ color: 0x545a5c, roughness: .9 });
    shared.busStopSign = new THREE.MeshStandardMaterial({ color: 0x2d6e94, roughness: .72 });
    shared.busShelterRoof = new THREE.MeshStandardMaterial({ color: 0x6f7777, roughness: .74, metalness: .04 });
    shared.busShelterGlass = new THREE.MeshStandardMaterial({ color: 0x75929b, roughness: .28, metalness: .08, transparent: true, opacity: .54, side: THREE.DoubleSide });
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

  function makeCarPlateTexture(text='SG'){
    const c=document.createElement('canvas');c.width=256;c.height=72;const ctx=c.getContext('2d');if(!ctx)return null;
    ctx.fillStyle='#f2f3ee';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#111';ctx.lineWidth=5;ctx.strokeRect(4,4,c.width-8,c.height-8);
    ctx.fillStyle='#111';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 34px -apple-system, Arial';ctx.fillText(`${text}  ·  DRV`,128,38);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;return t;
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

    // Extra exterior detail: still low-poly, but now reads like a finished modern saloon rather than a blockout.
    const roof=new THREE.Mesh(new THREE.BoxGeometry(1.42,.13,1.16),bodyMat);roof.position.set(0,1.68,-.23);roof.castShadow=true;car.add(roof);
    const windscreen=new THREE.Mesh(new THREE.BoxGeometry(1.46,.52,.045),glassMat);windscreen.position.set(0,1.39,.76);windscreen.rotation.x=-.43;car.add(windscreen);
    const rearGlass=windscreen.clone();rearGlass.position.z=-1.02;rearGlass.rotation.x=.43;car.add(rearGlass);
    [[-1.02,1.19,.55],[1.02,1.19,.55]].forEach(([x,y,z])=>{const mirror=new THREE.Mesh(new THREE.BoxGeometry(.22,.12,.34),trimMat);mirror.position.set(x,y,z);car.add(mirror);});
    const grille=new THREE.Mesh(new THREE.BoxGeometry(1.25,.28,.035),trimMat);grille.position.set(0,.72,2.185);car.add(grille);
    const chromeMat=new THREE.MeshStandardMaterial({color:0xb9c1c4,metalness:.72,roughness:.23});
    const badge=new THREE.Mesh(new THREE.TorusGeometry(.13,.035,6,12),chromeMat);badge.position.set(0,.78,2.215);badge.rotation.x=Math.PI/2;car.add(badge);
    const plateTexture=makeCarPlateTexture('SG');
    if(plateTexture){const plateMat=new THREE.MeshBasicMaterial({map:plateTexture,toneMapped:false});
      const fp=new THREE.Mesh(new THREE.PlaneGeometry(.62,.18),plateMat);fp.position.set(0,.50,2.195);car.add(fp);
      const rp=fp.clone();rp.position.set(0,.50,-2.195);rp.rotation.y=Math.PI;car.add(rp);}

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

  function noteBackendFailure(){
    backendFailureCount++;
    if(backendFailureCount>=2){
      backendCircuitUntil=performance.now()+BACKEND_CIRCUIT_SECONDS*1000;
      backendFailureCount=0;
    }
  }

  async function backendFetch(path,options={}){
    if(!BACKEND_ACTIVE)throw new Error('DriveSG backend disabled');
    if(performance.now()<backendCircuitUntil)throw new Error('DriveSG backend temporarily bypassed');
    const controller=new AbortController();
    const parentSignal=options.signal;
    const abortFromParent=()=>controller.abort();
    if(parentSignal?.aborted)controller.abort();
    else parentSignal?.addEventListener?.('abort',abortFromParent,{once:true});
    const timeout=setTimeout(()=>controller.abort(),path.startsWith('/api/map')?8500:4800);
    try{
      const res=await fetch(`${BACKEND_BASE}${path}`,{...options,signal:controller.signal});
      if(res.ok)backendFailureCount=0;
      else if(res.status>=500)noteBackendFailure();
      return res;
    }catch(err){
      noteBackendFailure();
      throw err;
    }finally{
      clearTimeout(timeout);
      parentSignal?.removeEventListener?.('abort',abortFromParent);
    }
  }

  function nextPaint(){
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }

  async function warmSceneShaders(){
    if(!renderer||!scene||!camera)return;
    const now=performance.now();
    if(now-lastShaderWarmup<12000)return;
    lastShaderWarmup=now;
    try{
      if(typeof renderer.compileAsync==='function')await renderer.compileAsync(scene,camera);
      else renderer.compile(scene,camera);
    }catch(_){/* shader warm-up is best effort */}
  }

  async function loadLocation(place, options = {}) {
    if(challenge.active&&!options.preserveChallenge)cancelChallenge({quiet:true,keepNavigation:true});
    if(navigation.active||navigation.routeGroup)clearNavigation({quiet:true});
    const generation = ++streamGeneration;
    streamBusy = true;
    mapMode = 'live';
    setMapState('loading');
    origin = { lat: place.lat, lon: place.lon };
    currentLocationName = place.name || 'Toa Payoh';
    currentDiscoveryZoneId='';
    els.locationName.textContent = currentLocationName;
    els.placeEyebrow.textContent = '';
    els.searchMsg.textContent = '';
    lastSpeedLimit=null;
    els.speedLimit?.classList.add('hidden');
    speedMps = 0;
    resetDrivingDynamics();
    resetSessionStats();
    input.gas = input.brake = input.steer = 0;
    updateSteerKnob(0);
    showLoader(`Preparing ${currentLocationName}…`, 5);
    let completed=false;

    try {
      setProgress(16, 'Reading Toa Payoh roads…');
      await nextPaint();
      const [data,terrain] = await Promise.all([
        fetchOsmData(place.lat, place.lon),
        fetchTerrainPatch(place.lat, place.lon)
      ]);
      if (generation !== streamGeneration) return false;
      activeTerrainPatch=terrain;
      setProgress(52, 'Building streets and HDB blocks…');
      await nextPaint();
      const built = buildWorld(data, { centerX: 0, centerZ: 0 }, terrain);
      if (built.roadCount < 3) throw new Error('Not enough road geometry');
      setProgress(86, 'Finishing details…');
      swapDynamicWorld(built);
      warmSceneShaders();
      loadedCenterWorld = { x: 0, z: 0 };
      placeCarNear(0, 0, true);
      savePlace(place);
      setProgress(100, 'Ready to drive');
      setMapState('live');
      setTimeout(hideLoader, 220);
      if (!options.keepPanelOpen) { if(!options.preserveChallenge)setPlaceMode('navigate'); closePanel(); }
      showToast('Toa Payoh ready');
      maybeShowExperienceHint();
      completed=true;
      return true;
    } catch (err) {
      console.warn('Live road data unavailable. Falling back to local roads.', err);
      if (generation !== streamGeneration) return false;
      setProgress(64, 'Preparing local roads…');
      await nextPaint();
      try {
        let built;
        try {
          built = buildFallbackWorld();
          swapDynamicWorld(built);
        } catch (fallbackErr) {
          console.warn('Local fallback failed; using emergency road grid.', fallbackErr);
          recordDiagnostic('fallback-world-failed',fallbackErr?.message||fallbackErr);
          setProgress(82, 'Recovering roads…');
          await nextPaint();
          built = buildEmergencyWorld();
          swapDynamicWorld(built);
        }
        loadedCenterWorld = { x: 0, z: 0 };
        placeCarNear(0, 0, true);
        mapMode = 'demo';
        setProgress(100, 'Ready to drive');
        setMapState('offline');
        setTimeout(hideLoader, 180);
        showToast('Local roads ready');
        if (!options.keepPanelOpen) { if(!options.preserveChallenge)setPlaceMode('navigate'); closePanel(); }
        completed=true;
        return true;
      } catch (fatalFallbackErr) {
        console.error('DriveSG could not build any drivable world.', fatalFallbackErr);
        recordDiagnostic('emergency-world-failed',fatalFallbackErr?.message||fatalFallbackErr);
        mapMode='demo';
        setMapState('offline');
        setProgress(100, 'Could not load Toa Payoh · try again');
        hideLoader();
        showToast('Could not load roads · try again');
        return false;
      }
    } finally {
      if (generation === streamGeneration) {
        streamBusy = false;
        // Never leave an iPhone trapped behind the loading overlay after a failed recovery.
        if(!completed&&els.loader&&!els.loader.classList.contains('hidden'))hideLoader();
      }
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
        const path=`/api/map?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&roadRadius=${ROAD_RADIUS_METERS}&buildingRadius=${BUILDING_RADIUS_METERS}&surfaceRadius=${SURFACE_RADIUS_METERS}&signalRadius=${SIGNAL_RADIUS_METERS}`;
        const res=await backendFetch(path,{headers:{Accept:'application/json'},signal:controller.signal});
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



  async function fetchTerrainPatch(lat,lon){
    const key=`${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
    if(terrainPatchCache.has(key))return terrainPatchCache.get(key);
    const half=TERRAIN_SPAN_METERS/2,size=TERRAIN_GRID_SIZE,lats=[],lons=[];
    for(let j=0;j<size;j++){
      const z=-half+(TERRAIN_SPAN_METERS*j/(size-1));
      for(let i=0;i<size;i++){
        const x=-half+(TERRAIN_SPAN_METERS*i/(size-1));
        lats.push(lat-z/110540);
        lons.push(lon+x/(111320*Math.cos(lat*Math.PI/180)));
      }
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
      const url=`${ELEVATION_ENDPOINT}?latitude=${lats.map(v=>v.toFixed(6)).join(',')}&longitude=${lons.map(v=>v.toFixed(6)).join(',')}`;
      const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
      if(!res.ok)throw new Error(`Elevation ${res.status}`);
      const data=await res.json(),values=Array.isArray(data?.elevation)?data.elevation.map(v=>Number(v)):null;
      if(!values||values.length!==size*size)throw new Error('Elevation grid incomplete');
      const center=project(lat,lon);
      // Clamp small below-sea artefacts. Singapore's playable road/land world is effectively above sea level,
      // while water polygons remain rendered at y≈0.
      const patch={key,centerX:center.x,centerZ:center.z,span:TERRAIN_SPAN_METERS,size,values:values.map(v=>Number.isFinite(v)?Math.max(0,v):0)};
      terrainPatchCache.set(key,patch);
      while(terrainPatchCache.size>8)terrainPatchCache.delete(terrainPatchCache.keys().next().value);
      return patch;
    }catch(err){
      console.warn('Terrain elevation unavailable; using flat fallback.',err?.message||err);
      return null;
    }finally{clearTimeout(timer);}
  }

  function terrainHeightAt(x,z,patch=activeTerrainPatch){
    if(!patch?.values?.length)return 0;
    const half=patch.span/2,n=patch.size-1;
    let u=(x-patch.centerX+half)/patch.span*n,v=(z-patch.centerZ+half)/patch.span*n;
    if(u<-.3||v<-.3||u>n+.3||v>n+.3)return 0;
    u=THREE.MathUtils.clamp(u,0,n);v=THREE.MathUtils.clamp(v,0,n);
    const x0=Math.floor(u),x1=Math.min(n,x0+1),z0=Math.floor(v),z1=Math.min(n,z0+1),tx=u-x0,tz=v-z0;
    const at=(xx,zz)=>patch.values[zz*patch.size+xx]||0;
    const a=THREE.MathUtils.lerp(at(x0,z0),at(x1,z0),tx),b=THREE.MathUtils.lerp(at(x0,z1),at(x1,z1),tx);
    return THREE.MathUtils.lerp(a,b,tz);
  }

  function buildTerrainMesh(centerX,centerZ,patch){
    if(!patch)return null;
    const span=Math.min(patch.span,3500),half=span/2,steps=24,verts=[];
    for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){
      const x0=centerX-half+span*i/steps,x1=centerX-half+span*(i+1)/steps;
      const z0=centerZ-half+span*j/steps,z1=centerZ-half+span*(j+1)/steps;
      const a=[x0,terrainHeightAt(x0,z0,patch)-.12,z0],b=[x1,terrainHeightAt(x1,z0,patch)-.12,z0],
            c=[x1,terrainHeightAt(x1,z1,patch)-.12,z1],d=[x0,terrainHeightAt(x0,z1,patch)-.12,z1];
      pushTri(verts,a,b,c);pushTri(verts,a,c,d);
    }
    const mesh=meshFromFlatVertices(verts,shared.terrain,true);mesh.renderOrder=0;mesh.userData.qualityLayer='terrain';return mesh;
  }

  function makeEmptyNavigation() {
    return {
      active:false, mode:'idle', fetching:false, destination:null,
      routeCoords:[], routeWorld:[], cumulativeM:[], totalM:0, durationS:0,
      steps:[], progressM:0, remainingM:0, remainingS:0, nearestIndex:0,
      nearestDistance:Infinity, routeGroup:null, lastRerouteAt:-Infinity, trafficMultiplier:1, trafficLabel:'',
      lastInstructionKey:'', arrived:false
    };
  }

  function currentCarCoords() {
    return car ? unproject(car.position.x,car.position.z) : {lat:origin.lat,lon:origin.lon};
  }


  function localRoadGraphSnapshot(){
    const nodes=new Map();
    for(const seg of roadSegments){
      if(!seg||seg.tunnel)continue;
      const aGeo=unproject(seg.ax,seg.az),bGeo=unproject(seg.bx,seg.bz);
      if(!insideSingapore(aGeo.lat,aGeo.lon)||!insideSingapore(bGeo.lat,bGeo.lon))continue;
      if(seg.fromKey&&!nodes.has(seg.fromKey))nodes.set(seg.fromKey,{x:seg.ax,z:seg.az});
      if(seg.toKey&&!nodes.has(seg.toKey))nodes.set(seg.toKey,{x:seg.bx,z:seg.bz});
    }
    return nodes;
  }

  function nearestLocalGraphKey(point,nodes){
    let key=null,best=Infinity;
    for(const [k,p] of nodes){const d=(p.x-point.x)**2+(p.z-point.z)**2;if(d<best){best=d;key=k;}}
    return key;
  }

  function localRouteCost(seg){
    const len=Math.hypot(seg.bx-seg.ax,seg.bz-seg.az);
    const factor=/primary/.test(seg.type)?0.94:(/secondary/.test(seg.type)?0.98:(/tertiary/.test(seg.type)?1.0:(/service|living_street/.test(seg.type)?1.28:1.08)));
    return len*factor;
  }

  function localGraphPath(startKey,endKey,nodes){
    if(!startKey||!endKey)return null;
    const dist=new Map([[startKey,0]]),prev=new Map(),heap=[[0,startKey]];
    const push=(item)=>{heap.push(item);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{if(!heap.length)return null;const root=heap[0],last=heap.pop();if(heap.length&&last){heap[0]=last;let i=0;while(true){const l=i*2+1,r=l+1;let b=i;if(l<heap.length&&heap[l][0]<heap[b][0])b=l;if(r<heap.length&&heap[r][0]<heap[b][0])b=r;if(b===i)break;[heap[i],heap[b]]=[heap[b],heap[i]];i=b;}}return root;};
    let guard=0;
    while(heap.length&&guard++<18000){
      const item=pop();if(!item)break;const [d,key]=item;if(d!==(dist.get(key)))continue;if(key===endKey)break;
      for(const edge of roadGraph.get(key)||[]){
        const seg=edge.seg;if(!seg||seg.tunnel)continue;
        const next=edge.dir>0?seg.toKey:seg.fromKey;if(!next||!nodes.has(next))continue;
        const nd=d+localRouteCost(seg);if(nd<(dist.get(next)??Infinity)){dist.set(next,nd);prev.set(next,{key,seg,dir:edge.dir});push([nd,next]);}
      }
    }
    if(startKey!==endKey&&!prev.has(endKey))return null;
    const keys=[endKey],edges=[];let k=endKey,guard2=0;
    while(k!==startKey&&guard2++<8000){const v=prev.get(k);if(!v)return null;edges.push(v);k=v.key;keys.push(k);}keys.reverse();edges.reverse();
    return {keys,edges};
  }

  function buildLocalTownRoute(start,destination,via=[]){
    if(!roadSegments.length||!roadGraph.size)return null;
    const nodes=localRoadGraphSnapshot();if(nodes.size<3)return null;
    const checks=[start,...(Array.isArray(via)?via:[]),destination];
    let allWorld=[],allEdges=[],distance=0;
    for(let li=0;li<checks.length-1;li++){
      const a=project(checks[li].lat,checks[li].lon),b=project(checks[li+1].lat,checks[li+1].lon);
      const ak=nearestLocalGraphKey(a,nodes),bk=nearestLocalGraphKey(b,nodes),path=localGraphPath(ak,bk,nodes);if(!path)return null;
      const pts=path.keys.map(k=>nodes.get(k)).filter(Boolean);
      if(!pts.length)return null;
      if(li===0)allWorld.push(a);
      for(const q of pts){if(!allWorld.length||Math.hypot(allWorld.at(-1).x-q.x,allWorld.at(-1).z-q.z)>.5)allWorld.push(q);}
      allWorld.push(b);allEdges.push(...path.edges);
    }
    const coords=allWorld.map(q=>unproject(q.x,q.z)).filter(c=>insideSingapore(c.lat,c.lon));
    if(coords.length<2)return null;
    for(let i=1;i<coords.length;i++)distance+=haversineMeters(coords[i-1].lat,coords[i-1].lon,coords[i].lat,coords[i].lon);
    const steps=[];let lastName='',lastBearing=null,progressIndex=1;
    for(const edge of allEdges){
      const name=edge.seg?.name||'';if(!name||name===lastName){lastName=name||lastName;continue;}
      const a=edge.dir>0?{x:edge.seg.ax,z:edge.seg.az}:{x:edge.seg.bx,z:edge.seg.bz},b=edge.dir>0?{x:edge.seg.bx,z:edge.seg.bz}:{x:edge.seg.ax,z:edge.seg.az};
      const bearing=(Math.atan2(b.x-a.x,b.z-a.z)*180/Math.PI+360)%360;let modifier='straight';
      if(lastBearing!=null){const delta=((bearing-lastBearing+540)%360)-180;if(delta>22)modifier=delta>60?'right':'slight right';else if(delta<-22)modifier=delta<-60?'left':'slight left';}
      const loc=unproject(a.x,a.z);steps.push({distance:0,duration:0,name,type:lastBearing==null?'depart':'turn',maneuver:{type:lastBearing==null?'depart':'turn',modifier,location:[loc.lon,loc.lat],bearing_after:bearing}});
      lastBearing=bearing;lastName=name;progressIndex++;
    }
    return {geometry:{coordinates:coords.map(c=>[c.lon,c.lat])},distance,duration:Math.max(45,distance/8.3),legs:[{steps}]};
  }

  async function navigateTo(place, options={}) {
    if(challenge.active&&!options.challengeRoute)cancelChallenge({quiet:true,keepNavigation:true});
    if(guidedDrive?.active&&!options.guidedDrive)cancelGuidedDrive({quiet:true});
    if(!place || !insideSingapore(Number(place.lat),Number(place.lon))) {
      showToast('Choose a destination inside Toa Payoh');
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
    await requestNavigationRoute(start,navigation.destination,{reroute:false,quiet:options.quiet,via:Array.isArray(options.via)?options.via:[]});
  }

  async function requestNavigationRoute(start,destination,{reroute=false,quiet=false,via=[]}={}) {
    if(!destination)return;
    navigation.fetching=true;
    navigation.active=true;
    navigation.mode=navigation.routeWorld.length?'route':'loading';
    navigation.lastRerouteAt=clock?.elapsedTime||0;
    els.navBanner.classList.add('show');
    els.navBanner.classList.toggle('rerouting',reroute);
    els.navArrow.textContent=reroute?'↻':'⌁';
    els.navArrow.style.transform='none';
    els.navInstruction.textContent=reroute?'Re-routing…':`Finding a local route to ${destination.name}…`;
    els.navTurnDistance.textContent='';
    els.navDestinationName.textContent=destination.name;
    els.navRemaining.textContent='—';
    els.navEta.textContent='';

    try{
      const validVia=(Array.isArray(via)?via:[])
        .filter(p=>p&&insideSingapore(Number(p.lat),Number(p.lon)))
        .map(p=>({lat:Number(p.lat),lon:Number(p.lon)}));
      const localRoute=buildLocalTownRoute(start,destination,validVia);
      if(!localRoute)throw new Error('No connected local road path');
      applyRoute(localRoute,destination);
      if(!quiet)showToast(`Route ready · ${formatDistance(navigation.totalM)}`);
    }catch(err){
      console.warn('Local Toa Payoh route unavailable; using compass guidance.',err);
      activateCompassGuidance(destination);
      if(!quiet)showToast('Local route unavailable · follow the marker');
    }finally{
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
    navigation.trafficMultiplier=1;navigation.trafficLabel='';
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
    els.routingCredit.textContent='';
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
    document.body.classList.remove('navigating');
    if(els.navProgressBar)els.navProgressBar.style.width='0%';
    els.routingCredit.textContent='';
    els.placeEyebrow.textContent='';
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
      navigation.remainingS=Math.max(0,navigation.durationS*ratio*(navigation.trafficMultiplier||1));

      if(hit.distance>ROUTE_OFFTRACK_METERS&&!navigation.fetching&&elapsed-navigation.lastRerouteAt>ROUTE_REROUTE_COOLDOWN){
        navigation.lastRerouteAt=elapsed;
        requestNavigationRoute(carCoords,navigation.destination,{reroute:true,quiet:true,via:guidedRemainingVia()});
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
    document.body.classList.add('navigating');
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
      els.navEta.textContent=navigation.remainingS?`${formatEta(navigation.remainingS)}${navigation.trafficLabel?` · ${navigation.trafficLabel}`:''}`:'';
      if(els.navProgressBar)els.navProgressBar.style.width=`${THREE.MathUtils.clamp(navigation.totalM?navigation.progressM/navigation.totalM*100:0,0,100)}%`;
      const incidentAhead=nearestIncidentAhead();
      els.miniMapFooter.textContent=incidentAhead?`⚠ ${incidentAhead.type||'Traffic incident'} · ${formatDistance(incidentAhead.aheadM)} ahead`:`${formatDistance(navigation.remainingM)} · ${navigation.destination.name}${navigation.trafficLabel?` · ${navigation.trafficLabel}`:''}`;
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
      if(els.navProgressBar)els.navProgressBar.style.width='0%';
      els.miniMapFooter.textContent=`${formatDistance(navigation.remainingM||directToDest)} · ${navigation.destination.name}`;
    }
  }

  function arriveAtDestination() {
    if(navigation.arrived)return;
    navigation.arrived=true;
    navigation.active=false;
    const completedChallenge=finishChallenge();
    const completedGuide=finishGuidedDrive();
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
    if(!completedChallenge&&!completedGuide)setTimeout(()=>{if(navigation.arrived)clearNavigation({quiet:true});},5000);
    if(!completedChallenge&&!completedGuide)showToast(`Arrived at ${navigation.destination.name}`);
    if(completedGuide)setTimeout(()=>{if(navigation.arrived)clearNavigation({quiet:true});},9000);
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
    placeMode=mode==='start'?'start':(mode==='challenge'?'challenge':'navigate');
    discoveryViewOpen=false;
    els.discoverSection?.classList.add('hidden');
    const nav=placeMode==='navigate',startHere=placeMode==='start',challengeView=placeMode==='challenge';
    els.navigateModeBtn.classList.toggle('active',nav);
    els.startModeBtn.classList.toggle('active',startHere);
    els.challengeModeBtn?.classList.toggle('active',challengeView);
    els.placePicker?.classList.toggle('hidden',challengeView);
    els.challengeSection?.classList.toggle('hidden',!challengeView);
    if(challengeView){
      els.panelTitle.textContent='Toa Payoh drives';
      els.panelIntro.textContent='';
      buildChallengeButtons();
      return;
    }
    els.panelTitle.textContent=nav?'Toa Payoh':'Start in Toa Payoh';
    els.panelIntro.textContent=nav
      ?'':'';
    els.searchInput.placeholder=nav?'Search Toa Payoh road or place':'Search Toa Payoh road or place';
    els.randomBtnLabel.textContent='Surprise me';
  }

  function handlePlaceChoice(place) {
    if(placeMode==='navigate')navigateTo(place);
    else if(placeMode==='challenge')return;
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

  function makeEmptyChallenge() {
    return { active:false, phase:'idle', id:'', def:null, startedAt:0, countdownEnds:0, elapsedS:0, offRoadS:0, speedingS:0, speedingPenalty:0, collisions:0, redLights:0, score:100, lastCollisionAt:-Infinity, newBest:false };
  }

  function readChallengeBests(){
    try{const v=JSON.parse(localStorage.getItem('drivesg-challenge-bests')||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}
  }

  function writeChallengeBests(v){try{localStorage.setItem('drivesg-challenge-bests',JSON.stringify(v));}catch(_){} }

  function challengeGrade(score){if(score>=96)return'S';if(score>=90)return'A';if(score>=80)return'B';if(score>=68)return'C';return'D';}

  function formatChallengeTime(seconds){
    const n=Math.max(0,Number(seconds)||0),mins=Math.floor(n/60),secs=n-mins*60;
    return `${mins}:${secs.toFixed(1).padStart(4,'0')}`;
  }

  function buildChallengeButtons(){
    if(!els.challengeGrid)return;
    const bests=readChallengeBests();
    const completed=CHALLENGES.filter(c=>Number.isFinite(bests[c.id]?.bestTimeS)).length;
    if(els.challengeProgressLabel)els.challengeProgressLabel.textContent=`${completed}/${CHALLENGES.length} completed`;
    els.challengeGrid.innerHTML='';
    CHALLENGES.forEach(def=>{
      const best=bests[def.id],button=document.createElement('button');button.type='button';button.className='challenge-card'+(best?' completed':'');
      const bestText=best?formatChallengeTime(best.bestTimeS):'Not driven';
      button.innerHTML=`<div class="challenge-card-head"><strong>${escapeHtml(def.name)}</strong><span class="challenge-chip">${escapeHtml(def.difficulty)}</span></div><span class="challenge-route">${escapeHtml(def.start.name)} → ${escapeHtml(def.finish.name)}</span><div class="challenge-best"><span>PERSONAL BEST</span><b>${bestText}</b></div>`;
      button.addEventListener('click',()=>startChallenge(def));
      els.challengeGrid.appendChild(button);
    });
  }

  async function startChallenge(def){
    if(!def)return;
    lastChallengeId=def.id;
    challenge=makeEmptyChallenge();
    challenge.active=true;challenge.phase='loading';challenge.id=def.id;challenge.def=def;
    hideChallengeResult();
    clearNavigation({quiet:true});
    closePanel();
    els.challengeHud?.classList.add('show');
    if(els.challengeHudName)els.challengeHudName.textContent=def.name;
    if(els.challengeTimer)els.challengeTimer.textContent='READY';
    if(els.challengeScore)els.challengeScore.textContent='100';
    const loaded=await loadLocation(def.start,{preserveChallenge:true,keepPanelOpen:false});
    if(!challenge.active||challenge.id!==def.id)return;
    if(!loaded){
      cancelChallenge({quiet:true,keepNavigation:false});
      setPlaceMode('challenge');
      setPanelOpen(true);
      showToast('Challenge could not start · try again');
      return;
    }
    await navigateTo(def.finish,{quiet:true,challengeRoute:true});
    if(!challenge.active||challenge.id!==def.id)return;
    beginChallengeCountdown();
  }

  function beginChallengeCountdown(){
    challenge.phase='countdown';
    challenge.countdownEnds=(clock?.elapsedTime||0)+3.25;
    challenge.elapsedS=0;challenge.score=100;
    speedMps=0;reverseEngaged=false;clearInputs();
    els.challengeCountdown?.classList.add('show');
    els.challengeCountdown?.classList.remove('go');
    if(els.challengeCountdownText)els.challengeCountdownText.textContent='3';
    showToast('Clean drive = higher score');
  }

  function updateChallenge(dt,elapsed){
    if(!challenge.active)return;
    if(challenge.phase==='countdown'){
      clearInputs();speedMps*=Math.max(0,1-dt*8);
      const remaining=challenge.countdownEnds-elapsed;
      if(remaining<=0){
        challenge.phase='running';challenge.startedAt=elapsed;challenge.elapsedS=0;
        if(els.challengeCountdownText)els.challengeCountdownText.textContent='GO';
        els.challengeCountdown?.classList.add('go');
        setTimeout(()=>{if(challenge.phase==='running')els.challengeCountdown?.classList.remove('show','go');},520);
      }else if(els.challengeCountdownText){
        els.challengeCountdownText.textContent=String(Math.min(3,Math.max(1,Math.ceil(remaining))));
      }
      return;
    }
    if(challenge.phase!=='running')return;
    challenge.elapsedS=Math.max(0,elapsed-challenge.startedAt);
    const kmh=Math.abs(speedMps)*3.6;
    if(kmh>4&&!onRoad)challenge.offRoadS+=dt;
    if(lastSpeedLimit&&kmh>lastSpeedLimit+6){
      challenge.speedingS+=dt;
      challenge.speedingPenalty+=dt*.34*Math.min(2.4,1+(kmh-lastSpeedLimit-6)/28);
    }
    challenge.score=Math.max(0,Math.round(100-challenge.collisions*12-challenge.redLights*10-challenge.offRoadS*1.25-challenge.speedingPenalty));
    if(els.challengeTimer)els.challengeTimer.textContent=formatChallengeTime(challenge.elapsedS);
    if(els.challengeScore)els.challengeScore.textContent=String(challenge.score);
  }

  function recordChallengeCollision(elapsed){
    if(!challenge.active||challenge.phase!=='running'||elapsed-challenge.lastCollisionAt<.85)return;
    challenge.lastCollisionAt=elapsed;challenge.collisions++;
    if(challenge.collisions<=3)showToast(`Collision · drive score -12`);
  }

  function recordRedLightViolation(elapsed){
    if(challenge.active&&challenge.phase==='running'){challenge.redLights++;showToast('Red light · drive score -10');}
    else showToast('Red light');
    userSignalTracker.violatedAt=elapsed;
  }

  function finishChallenge(){
    if(!challenge.active||challenge.phase!=='running'||!challenge.def)return false;
    challenge.phase='finished';
    const def=challenge.def,bests=readChallengeBests(),old=bests[def.id]||null;
    const result={bestTimeS:old?.bestTimeS,bestScore:Math.max(Number(old?.bestScore)||0,challenge.score),runs:(Number(old?.runs)||0)+1};
    challenge.newBest=!Number.isFinite(old?.bestTimeS)||challenge.elapsedS<old.bestTimeS;
    if(challenge.newBest)result.bestTimeS=challenge.elapsedS;
    else result.bestTimeS=old.bestTimeS;
    bests[def.id]=result;writeChallengeBests(bests);buildChallengeButtons();
    if(els.challengeResultTitle)els.challengeResultTitle.textContent=def.name;
    if(els.challengeResultTime)els.challengeResultTime.textContent=formatChallengeTime(challenge.elapsedS);
    if(els.challengeBestTime)els.challengeBestTime.textContent=challenge.newBest?'NEW PERSONAL BEST':`BEST ${formatChallengeTime(result.bestTimeS)}`;
    if(els.challengeResultScore)els.challengeResultScore.textContent=String(challenge.score);
    if(els.challengeGrade)els.challengeGrade.textContent=challengeGrade(challenge.score);
    if(els.challengeCollisions)els.challengeCollisions.textContent=String(challenge.collisions);
    if(els.challengeOffroad)els.challengeOffroad.textContent=`${challenge.offRoadS.toFixed(1)}s`;
    if(els.challengeSpeeding)els.challengeSpeeding.textContent=`${challenge.speedingS.toFixed(1)}s`;
    if(els.challengeRedLights)els.challengeRedLights.textContent=String(challenge.redLights||0);
    const notes=[];
    if(challenge.newBest)notes.push('New personal best.');
    if(challenge.score>=96)notes.push('Exceptional control — almost spotless.');
    else if(challenge.collisions)notes.push(`${challenge.collisions} collision${challenge.collisions===1?'':'s'} cost ${challenge.collisions*12} score.`);
    else if(challenge.redLights)notes.push(`${challenge.redLights} red-light violation${challenge.redLights===1?'':'s'} cost ${challenge.redLights*10} score.`);
    else if(challenge.offRoadS>2)notes.push('Keep the car on the road to protect your score.');
    else if(challenge.speedingS>5)notes.push('A little less speeding would lift the drive score.');
    else notes.push('Clean, controlled drive.');
    if(els.challengeResultNote)els.challengeResultNote.textContent=notes.join(' ');
    els.challengeHud?.classList.remove('show');
    els.challengeCountdown?.classList.remove('show','go');
    els.challengeResult?.classList.add('show');document.body.classList.add('challenge-result-open');clearInputs();
    return true;
  }

  function hideChallengeResult(){els.challengeResult?.classList.remove('show');document.body.classList.remove('challenge-result-open');}

  function cancelChallenge({quiet=false,keepNavigation=false}={}){
    if(!challenge.active)return;
    challenge=makeEmptyChallenge();
    els.challengeHud?.classList.remove('show');els.challengeCountdown?.classList.remove('show','go');hideChallengeResult();
    if(!keepNavigation)clearNavigation({quiet:true});
    if(!quiet)showToast('Challenge ended');
  }

  function finishChallengeAndClose(){
    hideChallengeResult();
    challenge=makeEmptyChallenge();
    clearNavigation({quiet:true});
    setPlaceMode('challenge');
    setPanelOpen(true);
  }

  function replayLastChallenge(){
    const def=CHALLENGES.find(c=>c.id===lastChallengeId)||challenge.def;
    hideChallengeResult();challenge=makeEmptyChallenge();
    if(def)startChallenge(def);
  }


  function readDiscoveryPassport(){
    try{
      const raw=JSON.parse(localStorage.getItem('drivesg-singapore-passport-v1')||'{}');
      return raw&&typeof raw==='object'?raw:{};
    }catch(_){return {};}
  }

  function writeDiscoveryPassport(data){
    try{localStorage.setItem('drivesg-singapore-passport-v1',JSON.stringify(data));}catch(_){}
  }

  function discoveryTotalCount(){
    return DISCOVERY_ZONES.length+Object.keys(LANDMARK_INFO).length;
  }

  function updatePassportProgress(){
    const passport=readDiscoveryPassport(),count=Object.keys(passport).filter(k=>passport[k]).length,total=discoveryTotalCount();
    if(els.passportProgress)els.passportProgress.textContent=`${Math.min(count,total)} / ${total} places discovered`;
    if(els.passportBar)els.passportBar.style.width=`${Math.min(100,total?count/total*100:0)}%`;
    return {count,total};
  }

  function markDiscovered(key){
    if(!key)return false;
    const passport=readDiscoveryPassport();
    const fresh=!passport[key];
    passport[key]={at:Date.now()};
    writeDiscoveryPassport(passport);
    if(fresh)updatePassportProgress();
    return fresh;
  }

  function buildGuidedDriveButtons(){
    if(!els.guidedDriveGrid)return;
    const completed=readGuidedDriveCompleted();
    els.guidedDriveGrid.innerHTML='';
    for(const def of GUIDED_DRIVES){
      const btn=document.createElement('button');btn.type='button';btn.className='guided-drive'+(completed.has(def.id)?' completed':'');
      btn.innerHTML=`<span class="gd-kicker">${escapeHtml(def.kicker)}<i>${completed.has(def.id)?'✓ DRIVEN':escapeHtml(def.duration)}</i></span><strong>${escapeHtml(def.name)}</strong><p>${escapeHtml(def.summary)}</p><small>${escapeHtml(def.start.name)} → ${escapeHtml(def.finish.name)}</small>`;
      btn.addEventListener('click',()=>startGuidedDrive(def));
      els.guidedDriveGrid.appendChild(btn);
    }
  }

  function readGuidedDriveCompleted(){
    try{
      const arr=JSON.parse(localStorage.getItem('drivesg-guided-drives-v1')||'[]');
      return new Set(Array.isArray(arr)?arr:[]);
    }catch(_){return new Set();}
  }

  function writeGuidedDriveCompleted(set){
    try{localStorage.setItem('drivesg-guided-drives-v1',JSON.stringify([...set]));}catch(_){}
  }

  function openDiscoverView(){
    discoveryViewOpen=true;
    els.placePicker?.classList.add('hidden');
    els.challengeSection?.classList.add('hidden');
    els.discoverSection?.classList.remove('hidden');
    if(els.panelTitle)els.panelTitle.textContent='Explore Toa Payoh';
    if(els.panelIntro)els.panelIntro.textContent='';
    buildGuidedDriveButtons();
    updatePassportProgress();
  }

  function closeDiscoverView(){
    discoveryViewOpen=false;
    els.discoverSection?.classList.add('hidden');
    if(placeMode==='challenge'){els.challengeSection?.classList.remove('hidden');}
    else{els.placePicker?.classList.remove('hidden');}
    setPlaceMode(placeMode);
  }

  async function startGuidedDrive(def){
    if(!def)return;
    guidedDrive={active:true,def,startedAt:Date.now(),highlightSeen:new Set(),viaPassed:new Set(),arrival:false};
    closeDiscoverView();
    setPanelOpen(false);
    showLoader(`Starting ${def.name}…`,5);
    await loadLocation({...def.start,subtitle:def.kicker},{preserveGuidedDrive:true});
    if(!guidedDrive?.active||guidedDrive.def?.id!==def.id)return;
    await navigateTo({...def.finish,subtitle:def.kicker},{quiet:true,guidedDrive:true,via:def.via||[]});
    if(guidedDrive?.active){
      showDiscoveryCard('ROUTE',def.name,def.summary,'',5600);
      showToast(`${def.start.name} → ${def.finish.name}`);
    }
  }

  function closeJourneyPostcard(){els.journeyPostcard?.classList.remove('show');document.body.classList.remove('postcard-open');}

  function showJourneyPostcard(snapshot){
    if(!els.journeyPostcard||!snapshot)return;
    journeyPostcardLast=snapshot;
    const elapsedMs=Math.max(0,Date.now()-(snapshot.startedAt||Date.now()));
    const mins=Math.max(1,Math.round(elapsedMs/60000));
    const passport=updatePassportProgress();
    els.journeyPostcardTitle.textContent=snapshot.def.name;
    els.journeyPostcardRoute.textContent=`${snapshot.def.start.name} → ${snapshot.def.finish.name}`;
    els.journeyPostcardTime.textContent=`${mins} min`;
    els.journeyPostcardLandmarks.textContent=String(snapshot.highlightSeen?.size||0);
    els.journeyPostcardPassport.textContent=`${passport.count} / ${passport.total}`;
    els.journeyPostcardNote.textContent='Toa Payoh drive complete.';
    els.journeyPostcard.classList.add('show');document.body.classList.add('postcard-open');
  }

  function finishGuidedDrive(){
    if(!guidedDrive?.active||guidedDrive.arrival)return false;
    guidedDrive.arrival=true;
    const snapshot={...guidedDrive,highlightSeen:new Set(guidedDrive.highlightSeen||[])};
    const completed=readGuidedDriveCompleted();completed.add(guidedDrive.def.id);writeGuidedDriveCompleted(completed);
    buildGuidedDriveButtons();
    showDiscoveryCard('DRIVE COMPLETE',guidedDrive.def.name,'Toa Payoh route complete.','',3200);
    guidedDrive.active=false;
    setTimeout(()=>showJourneyPostcard(snapshot),900);
    return true;
  }

  function cancelGuidedDrive({quiet=false}={}){
    if(!guidedDrive?.active)return;
    guidedDrive=null;
    if(!quiet)showToast('Guided drive ended');
  }

  function showAreaRibbon(zone){
    if(!zone||!els.areaRibbon)return;
    clearTimeout(areaRibbonTimer);
    els.areaRibbonEyebrow.textContent='TOA PAYOH';
    els.areaRibbonTitle.textContent=zone.name;
    els.areaRibbonText.textContent=zone.tagline;
    els.areaRibbon.classList.add('show');
    areaRibbonTimer=setTimeout(()=>els.areaRibbon?.classList.remove('show'),5200);
  }

  function showDiscoveryCard(kicker,title,text,note,duration=7600){
    if(!els.discoveryCard)return;
    clearTimeout(discoveryCardTimer);
    els.discoveryKicker.textContent=kicker||'DISCOVERED';
    els.discoveryTitle.textContent=title||'Toa Payoh';
    els.discoveryText.textContent=text||'';
    els.discoveryDriveNote.textContent=note||'';
    els.discoveryCard.classList.add('show');
    discoveryCardTimer=setTimeout(()=>els.discoveryCard?.classList.remove('show'),duration);
  }

  function dismissDiscoveryCard(){
    clearTimeout(discoveryCardTimer);els.discoveryCard?.classList.remove('show');
  }

  function nearestDiscoveryZone(lat,lon){
    let best=null,bestD=Infinity;
    for(const zone of DISCOVERY_ZONES){
      const d=haversineMeters(lat,lon,zone.lat,zone.lon);
      if(d<zone.radius&&d<bestD){best=zone;bestD=d;}
    }
    return best?{zone:best,distance:bestD}:null;
  }

  function nearestNamedArea(lat,lon){
    const z=nearestDiscoveryZone(lat,lon);
    if(z)return z.zone.name;
    let best=null,bestD=Infinity;
    for(const p of PRESETS){
      const d=haversineMeters(lat,lon,p.lat,p.lon);if(d<bestD){best=p;bestD=d;}
    }
    return bestD<1800?`Near ${best.name}`:'Toa Payoh';
  }

  function guidedRemainingVia(){
    if(!guidedDrive?.active)return [];
    const via=guidedDrive.def?.via||[];
    return via.filter((_,i)=>!guidedDrive.viaPassed?.has(i));
  }

  function updateDiscoveryExperience(elapsed){
    if(!car||elapsed-lastDiscoveryCheck<.85)return;
    lastDiscoveryCheck=elapsed;
    const c=currentCarCoords();
    if(guidedDrive?.active){
      (guidedDrive.def?.via||[]).forEach((v,i)=>{
        if(!guidedDrive.viaPassed?.has(i)&&haversineMeters(c.lat,c.lon,v.lat,v.lon)<190)guidedDrive.viaPassed.add(i);
      });
    }
    const zoneHit=nearestDiscoveryZone(c.lat,c.lon);
    if(zoneHit?.zone?.id!==currentDiscoveryZoneId){
      currentDiscoveryZoneId=zoneHit?.zone?.id||'';
      applyDistrictVisualProfile(currentDiscoveryZoneId||'town-centre');
      if(zoneHit){
        const zone=zoneHit.zone,fresh=markDiscovered(`zone:${zone.id}`);
        showAreaRibbon(zone);
        if(fresh&&!guidedDrive?.active)showDiscoveryCard('AREA',zone.name,zone.text,'',4600);
      }
    }

    for(const lm of LANDMARKS){
      const info=LANDMARK_INFO[lm.kind];if(!info)continue;
      const d=haversineMeters(c.lat,c.lon,lm.lat,lm.lon);
      if(d>220)continue;
      const key=`landmark:${lm.kind}`;
      if(discoverySeenSession.has(key))continue;
      discoverySeenSession.add(key);
      const fresh=markDiscovered(key);
      if(guidedDrive?.active&&guidedDrive.def?.highlights?.includes(lm.kind))guidedDrive.highlightSeen.add(lm.kind);
      showDiscoveryCard('LANDMARK',lm.name,info.text,'',5200);
      break;
    }
  }

  function ensureHopMapResolution(){
    const c=els.hopMapCanvas;if(!c)return;
    const rect=c.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(700,Math.round(rect.width*ratio)),h=Math.max(360,Math.round(rect.height*ratio));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  }

  function inverseMercatorGlobalPixel(x,y,zoom){
    const n=Math.pow(2,zoom)*ONEMAP_TILE_SIZE;
    const lon=x/n*360-180;
    const yy=.5-y/n;
    const lat=90-360*Math.atan(Math.exp(-yy*2*Math.PI))/Math.PI;
    return {lat,lon};
  }

  function oneMapTileStyle(){
    return lightingNightFactor>.55||lightingMode==='night'?'night':'day';
  }

  function openHopMap(){
    selectedHopPoint=currentCarCoords();
    selectedHopPoint={...selectedHopPoint,name:nearestNamedArea(selectedHopPoint.lat,selectedHopPoint.lon)};
    els.hopMapOverlay?.classList.add('show');document.body.classList.add('hop-map-open');clearInputs();
    updateHopMapSelection();requestAnimationFrame(()=>{ensureHopMapResolution();paintHopMap();});
  }

  function closeHopMap(){
    els.hopMapOverlay?.classList.remove('show');document.body.classList.remove('hop-map-open');clearInputs();
  }

  function updateHopMapSelection(){
    if(!selectedHopPoint)return;
    if(els.hopMapPlaceName)els.hopMapPlaceName.textContent=selectedHopPoint.name||nearestNamedArea(selectedHopPoint.lat,selectedHopPoint.lon);
    if(els.hopMapCoords)els.hopMapCoords.textContent=`${selectedHopPoint.lat.toFixed(4)}, ${selectedHopPoint.lon.toFixed(4)}`;
  }

  function paintHopMap(){
    if(!els.hopMapOverlay?.classList.contains('show')||!els.hopMapCanvas)return;
    ensureHopMapResolution();
    const c=els.hopMapCanvas,ctx=c.getContext('2d'),w=c.width,h=c.height;
    const center={lat:1.3337,lon:103.8498},zoom=hopMapZoom,gp=mercatorGlobalPixel(center.lat,center.lon,zoom);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#102126';ctx.fillRect(0,0,w,h);
    const tx0=Math.floor((gp.x-w/2)/ONEMAP_TILE_SIZE)-1,tx1=Math.ceil((gp.x+w/2)/ONEMAP_TILE_SIZE)+1;
    const ty0=Math.floor((gp.y-h/2)/ONEMAP_TILE_SIZE)-1,ty1=Math.ceil((gp.y+h/2)/ONEMAP_TILE_SIZE)+1;
    let drawn=0;
    for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
      const entry=requestOneMapTile(zoom,tx,ty);if(!entry?.ready)continue;
      const dx=tx*ONEMAP_TILE_SIZE-gp.x+w/2,dy=ty*ONEMAP_TILE_SIZE-gp.y+h/2;
      try{ctx.drawImage(entry.img,dx,dy,ONEMAP_TILE_SIZE+.5,ONEMAP_TILE_SIZE+.5);drawn++;}catch(_){}
    }
    ctx.fillStyle=drawn?'rgba(3,10,13,.10)':'rgba(5,12,15,.2)';ctx.fillRect(0,0,w,h);
    const toScreen=(lat,lon)=>{const q=mercatorGlobalPixel(lat,lon,zoom);return{x:q.x-gp.x+w/2,y:q.y-gp.y+h/2};};
    for(const zone of DISCOVERY_ZONES){
      const q=toScreen(zone.lat,zone.lon);if(q.x<-20||q.x>w+20||q.y<-20||q.y>h+20)continue;
      ctx.beginPath();ctx.arc(q.x,q.y,4.6,0,Math.PI*2);ctx.fillStyle='rgba(126,230,199,.88)';ctx.fill();
      if(w>1000){ctx.font='700 14px -apple-system,BlinkMacSystemFont,Arial';ctx.fillStyle='rgba(255,255,255,.72)';ctx.fillText(zone.name,q.x+8,q.y+4);}
    }
    const here=currentCarCoords(),hq=toScreen(here.lat,here.lon);
    ctx.beginPath();ctx.arc(hq.x,hq.y,7,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#102126';ctx.stroke();
    if(selectedHopPoint){
      const q=toScreen(selectedHopPoint.lat,selectedHopPoint.lon);
      ctx.beginPath();ctx.arc(q.x,q.y,10,0,Math.PI*2);ctx.fillStyle='#7ee6c7';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='rgba(6,15,18,.9)';ctx.stroke();
      ctx.beginPath();ctx.arc(q.x,q.y,17,0,Math.PI*2);ctx.strokeStyle='rgba(126,230,199,.42)';ctx.lineWidth=2;ctx.stroke();
    }
  }

  function handleHopMapTap(e){
    const c=els.hopMapCanvas;if(!c)return;
    const rect=c.getBoundingClientRect(),ratioX=c.width/rect.width,ratioY=c.height/rect.height;
    const px=(e.clientX-rect.left)*ratioX,py=(e.clientY-rect.top)*ratioY;
    const center={lat:1.3337,lon:103.8498},gp=mercatorGlobalPixel(center.lat,center.lon,hopMapZoom);
    const q=inverseMercatorGlobalPixel(gp.x+(px-c.width/2),gp.y+(py-c.height/2),hopMapZoom);
    if(!insideSingapore(q.lat,q.lon)){showToast('Choose a point inside Toa Payoh');return;}
    selectedHopPoint={lat:q.lat,lon:q.lon,name:nearestNamedArea(q.lat,q.lon)};
    updateHopMapSelection();paintHopMap();
  }

  async function hopMapNavigate(){
    if(!selectedHopPoint)return;const p={...selectedHopPoint,subtitle:'Selected on Toa Payoh map'};closeHopMap();await navigateTo(p);
  }

  async function hopMapStart(){
    if(!selectedHopPoint)return;const p={...selectedHopPoint,subtitle:'Selected on Toa Payoh map'};closeHopMap();await loadLocation(p);
  }

  function ensureMiniMapResolution() {
    const c=els.miniMapCanvas;if(!c)return;
    const rect=c.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(240,Math.round(rect.width*ratio)),h=Math.max(180,Math.round(rect.height*ratio));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  }

  function mercatorGlobalPixel(lat,lon,zoom){
    const n=Math.pow(2,zoom),clampedLat=THREE.MathUtils.clamp(lat,-85.05112878,85.05112878),rad=clampedLat*Math.PI/180;
    const x=(lon+180)/360*n*ONEMAP_TILE_SIZE;
    const y=(.5-Math.log((1+Math.sin(rad))/(1-Math.sin(rad)))/(4*Math.PI))*n*ONEMAP_TILE_SIZE;
    return {x,y};
  }

  function oneMapMetersPerPixel(lat,zoom){
    return 156543.03392804097*Math.cos(lat*Math.PI/180)/Math.pow(2,zoom);
  }

  function chooseOneMapZoom(lat,targetMetersPerPixel){
    const raw=Math.log2((156543.03392804097*Math.cos(lat*Math.PI/180))/Math.max(.05,targetMetersPerPixel));
    return THREE.MathUtils.clamp(Math.round(raw),ONEMAP_MIN_ZOOM,ONEMAP_MAX_ZOOM);
  }

  function oneMapTileCacheLimit(){
    return graphicsTier==='performance'?48:(graphicsTier==='balanced'?72:96);
  }

  function requestOneMapTile(z,x,y){
    const n=Math.pow(2,z),tx=((x%n)+n)%n;
    if(y<0||y>=n)return null;
    const style=oneMapTileStyle(),key=`${style}:${z}/${tx}/${y}`;
    const cached=oneMapTileCache.get(key);if(cached)return cached;
    const img=new Image();
    const entry={img,ready:false,failed:false,lastUsed:performance.now(),style};oneMapTileCache.set(key,entry);
    img.decoding='async';
    img.onload=()=>{entry.ready=true;entry.failed=false;lastMiniMapPaint=-Infinity;if(els.hopMapOverlay?.classList.contains('show')&&!hopMapPaintPending){hopMapPaintPending=true;requestAnimationFrame(()=>{hopMapPaintPending=false;paintHopMap();});}};
    img.onerror=()=>{entry.failed=true;entry.ready=false;oneMapTileFailures++;if(oneMapTileFailures>18)oneMapTilesEnabled=false;};
    img.src=`${ONEMAP_TILE_BASES[style]}/${z}/${tx}/${y}.png`;
    while(oneMapTileCache.size>oneMapTileCacheLimit()){
      const oldest=oneMapTileCache.keys().next().value;oneMapTileCache.delete(oldest);
    }
    return entry;
  }

  function drawOneMapMiniMapBase(ctx,w,h,mapCenterX,mapCenterZ,scale,headingUp,overviewNorthUp,yaw){
    if(!oneMapTilesEnabled||scale<=0)return false;
    const centerCoord=unproject(mapCenterX,mapCenterZ),targetMpp=1/scale;
    if(!insideSingapore(centerCoord.lat,centerCoord.lon))return false;
    const zoom=chooseOneMapZoom(centerCoord.lat,targetMpp),tileMpp=oneMapMetersPerPixel(centerCoord.lat,zoom),factor=scale*tileMpp;
    if(!Number.isFinite(factor)||factor<=0)return false;
    const diag=Math.ceil(Math.hypot(w,h)*1.18),gp=mercatorGlobalPixel(centerCoord.lat,centerCoord.lon,zoom),tilePx=ONEMAP_TILE_SIZE*factor;
    const halfNative=(diag/2)/factor,tx0=Math.floor((gp.x-halfNative)/ONEMAP_TILE_SIZE)-1,tx1=Math.ceil((gp.x+halfNative)/ONEMAP_TILE_SIZE)+1;
    const ty0=Math.floor((gp.y-halfNative)/ONEMAP_TILE_SIZE)-1,ty1=Math.ceil((gp.y+halfNative)/ONEMAP_TILE_SIZE)+1;
    let drawn=0;
    ctx.save();ctx.translate(w/2,h*.53);if(headingUp&&!overviewNorthUp)ctx.rotate(-headingDegreesFromYaw(yaw)*Math.PI/180);ctx.globalAlpha=.82;
    for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
      const entry=requestOneMapTile(zoom,tx,ty);if(!entry||!entry.ready)continue;entry.lastUsed=performance.now();
      const dx=(tx*ONEMAP_TILE_SIZE-gp.x)*factor,dy=(ty*ONEMAP_TILE_SIZE-gp.y)*factor;
      try{ctx.drawImage(entry.img,dx,dy,tilePx+.5,tilePx+.5);drawn++;}catch(_){entry.failed=true;}
    }
    ctx.restore();
    if(!drawn)return false;
    ctx.save();ctx.fillStyle='rgba(5,13,17,.24)';ctx.fillRect(0,0,w,h);ctx.restore();
    return true;
  }

  function liveTrafficColorForSegment(seg){
    const v=Number(seg?.liveTrafficKmh);if(!Number.isFinite(v))return null;
    if(v<18)return '#f0675e';
    if(v<30)return '#f3a35c';
    if(v<45)return '#e9d56d';
    if(v<60)return '#8bd59d';
    return '#5ed3aa';
  }

  function nearestIncidentAhead(){
    if(!navigation.active||navigation.mode!=='route'||!liveTrafficIncidents.length||!navigation.routeWorld.length)return null;
    let best=null,bestAhead=Infinity;
    for(const incident of liveTrafficIncidents){
      const lat=Number(incident.latitude),lon=Number(incident.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const p=project(lat,lon),hit=routeProgressForPoint(p.x,p.z,true),ahead=hit.progressM-navigation.progressM;
      if(hit.distance>95||ahead<35||ahead>2200)continue;
      if(ahead<bestAhead){bestAhead=ahead;best={...incident,aheadM:ahead,routeDistanceM:hit.distance};}
    }
    return best;
  }

  function miniMapRefreshInterval(){
    if(miniMapExpanded)return graphicsTier==='performance'?.18:.12;
    return graphicsTier==='high'?.10:(graphicsTier==='balanced'?.135:.18);
  }

  function paintMiniMap(elapsed) {
    if(!els.miniMapCanvas||!car||elapsed-lastMiniMapPaint<miniMapRefreshInterval())return;
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
    const oneMapDrawn=drawOneMapMiniMapBase(ctx,w,h,mapCenterX,mapCenterZ,scale,miniMapHeadingUp,overviewNorthUp,yaw);
    if(!oneMapDrawn){ctx.fillStyle='#142126';ctx.fillRect(0,0,w,h);}

    const drawPoly=(pts,fill)=>{
      if(!pts?.length)return;
      const center=pts.reduce((a,p)=>({x:a.x+p.x/pts.length,z:a.z+p.z/pts.length}),{x:0,z:0});
      if(!near(center.x,center.z,1.5))return;
      ctx.beginPath();pts.forEach((p,i)=>{const q=toScreen(p.x,p.z);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.globalAlpha=oneMapDrawn?.32:1;ctx.fillStyle=fill;ctx.fill();ctx.globalAlpha=1;
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
      const trafficColor=liveTrafficColorForSegment(seg);ctx.strokeStyle=trafficColor||(seg.tunnel?'#586267':(seg.bridge?'#d7dedb':(seg.major?'#d0d8d5':'#aeb8b6')));ctx.globalAlpha=trafficColor?.9:(oneMapDrawn?.48:1);ctx.lineWidth=Math.max(trafficColor?2.1:1.2,Math.min(trafficColor?6.2:5.5,seg.width*scale*.82));ctx.stroke();ctx.globalAlpha=1;
    }

    for(const sig of trafficSignalsWorld){
      if(!near(sig.x,sig.z))continue;
      const phase=trafficSignalPhaseFor(sig,elapsed),signalColor=phase==='red'?'#ff776f':(phase==='amber'?'#ffd36b':'#75e696');
      const q=toScreen(sig.x,sig.z);ctx.beginPath();ctx.arc(q.x,q.y,2.3,0,Math.PI*2);ctx.fillStyle=signalColor;ctx.fill();
    }
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
    if(!navigation.active)els.miniMapFooter.textContent=`${lastRoadLabel||currentLocationName}`;
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

  function trafficVehicleType(seed){
    const r=pseudoRandom(seed*91+17);
    if(r>.93)return 'bus';
    if(r>.83)return 'taxi';
    if(r>.72)return 'van';
    if(r>.67)return 'lorry';
    return 'car';
  }

  function trafficVehicleSpec(type){
    if(type==='bus')return {sx:1.10,sy:1.68,sz:2.05,y:.72,radius:3.3,accel:.74,brake:.86,speed:.82};
    if(type==='lorry')return {sx:1.14,sy:1.42,sz:1.55,y:.58,radius:2.8,accel:.70,brake:.82,speed:.78};
    if(type==='van')return {sx:1.05,sy:1.28,sz:1.28,y:.51,radius:2.45,accel:.86,brake:.92,speed:.90};
    if(type==='taxi')return {sx:1.01,sy:1.03,sz:1.02,y:.44,radius:2.25,accel:1.00,brake:1.00,speed:.96};
    return {sx:1,sy:1,sz:1,y:.43,radius:2.2,accel:1,brake:1,speed:1};
  }

  function trafficRoadIsOneWay(seg){
    const one=String(seg.oneway||'').toLowerCase();
    return one==='yes'||one==='1'||one==='true'||one==='-1';
  }

  function trafficDirectionalLaneCount(seg,dir){
    if(trafficRoadIsOneWay(seg))return Math.max(1,Number(seg.lanes)||1);
    const tagged=dir>0?Number(seg.lanesForward):Number(seg.lanesBackward);
    if(Number.isFinite(tagged)&&tagged>0)return Math.max(1,Math.round(tagged));
    return Math.max(1,Math.floor((Number(seg.lanes)||2)/2));
  }

  function trafficLaneOffset(seg,dir,laneFloat=0){
    const laneCount=trafficDirectionalLaneCount(seg,dir);
    const carriageway=trafficRoadIsOneWay(seg)?seg.width:seg.width/2;
    const laneWidth=Math.min(3.55,Math.max(2.45,carriageway/laneCount));
    const clamped=THREE.MathUtils.clamp(laneFloat,0,Math.max(0,laneCount-1));
    // Lane 0 is the left-most lane in the direction of travel, matching Singapore keep-left traffic.
    const offset=(seg.width/2-laneWidth*(clamped+.5))*dir;
    return THREE.MathUtils.clamp(offset,-Math.max(.8,seg.width*.46),Math.max(.8,seg.width*.46));
  }

  function trafficTurnLaneSpec(seg,dir){
    if(dir>0&&seg.turnLanesForward)return seg.turnLanesForward;
    if(dir<0&&seg.turnLanesBackward)return seg.turnLanesBackward;
    if(trafficRoadIsOneWay(seg)&&seg.turnLanes)return seg.turnLanes;
    return '';
  }

  function trafficPreferredLaneForTurn(seg,dir,turn='straight'){
    const count=trafficDirectionalLaneCount(seg,dir);
    if(count<=1)return 0;
    const raw=trafficTurnLaneSpec(seg,dir);
    if(raw){
      const lanes=raw.split('|').map(v=>v.toLowerCase().split(';').map(x=>x.trim()));
      const wanted=turn==='left'?['left','slight_left']:turn==='right'?['right','slight_right']:['through','straight','none'];
      const matches=[];
      lanes.forEach((vals,i)=>{if(vals.some(v=>wanted.includes(v)))matches.push(i);});
      if(matches.length)return THREE.MathUtils.clamp(turn==='right'?matches[matches.length-1]:matches[0],0,count-1);
    }
    if(turn==='left')return 0;
    if(turn==='right')return count-1;
    return 0;
  }

  function trafficTurnClass(seg,dir,nextSeg,nextDir){
    if(!seg||!nextSeg)return 'straight';
    const ax=(seg.bx-seg.ax)*dir,az=(seg.bz-seg.az)*dir,al=Math.hypot(ax,az)||1;
    const bx=(nextSeg.bx-nextSeg.ax)*nextDir,bz=(nextSeg.bz-nextSeg.az)*nextDir,bl=Math.hypot(bx,bz)||1;
    const dot=THREE.MathUtils.clamp((ax*bx+az*bz)/(al*bl),-1,1);
    const cross=(ax*bz-az*bx)/(al*bl);
    const angle=Math.acos(dot)*180/Math.PI;
    if(angle<28)return 'straight';
    if(angle>150)return 'uturn';
    // In DriveSG's x/east, z/south coordinate plane, positive cross is a right turn.
    return cross>0?'right':'left';
  }

  function createAmbientTraffic(_group,_segments,_graph=roadGraph) {
    ambientTraffic=[];
    trafficMesh=null;
    // Focused Toa Payoh prototype intentionally has no ambient/public traffic.
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
      const turn=trafficTurnClass(seg,agent.dir,e.seg,e.dir);
      const uturnPenalty=turn==='uturn'?-4:0;
      const classContinuity=e.seg.major===seg.major?.25:0;
      const roadNameContinuity=seg.name&&e.seg.name===seg.name?.34:0;
      const score=dot*1.50+classContinuity+roadNameContinuity+uturnPenalty+pseudoRandom((e.seg.ax+e.seg.az+idx*17)*3)*.54;
      if(score>bestScore){bestScore=score;best={...e,turn};}
    });
    return best;
  }

  function prepareNextTrafficLeg(agent){
    if(agent.nextLeg)return agent.nextLeg;
    const next=chooseNextTrafficLeg(agent);
    if(next){agent.nextLeg=next;agent.nextTurn=next.turn||'straight';}
    return next;
  }

  function respawnTrafficAgent(agent,index){
    const eligible=roadSegments.filter(s=>Math.hypot(s.bx-s.ax,s.bz-s.az)>24&&!/service|living_street/.test(s.type||''));if(!eligible.length)return;
    const seg=eligible[Math.floor(pseudoRandom((clock?.elapsedTime||0)*13+index*47+5)*eligible.length)],dirs=[1,-1].filter(d=>trafficCanTraverse(seg,d));
    const dir=dirs[Math.floor(pseudoRandom(index*23+9)*dirs.length)]||1,laneCount=trafficDirectionalLaneCount(seg,dir);
    agent.seg=seg;agent.dir=dir;agent.t=dir>0?0:1;agent.cruise=trafficCruiseFor(seg,index+31)*trafficVehicleSpec(agent.type).speed;agent.speed=agent.cruise*.55;
    agent.laneIndex=0;agent.targetLane=0;agent.laneFloat=0;agent.laneCooldown=1.2;agent.nextLeg=null;agent.nextTurn='straight';agent.dwellUntil=0;agent.lastBusStopId=null;agent.visualYaw=null;agent.turnBlend=null;
  }

  function trafficSignalPhase(elapsed){return trafficSignalPhaseFor(null,elapsed);}

  function trafficSignalPhaseFor(signal,elapsed){
    const group=signal?.phaseGroup||0,offset=signal?.phaseOffset||0;
    const t=((elapsed+offset)%TRAFFIC_SIGNAL_CYCLE_SECONDS+TRAFFIC_SIGNAL_CYCLE_SECONDS)%TRAFFIC_SIGNAL_CYCLE_SECONDS;
    if(group===0){
      if(t<12)return 'green';
      if(t<15)return 'amber';
      return 'red';
    }
    if(t>=16&&t<28)return 'green';
    if(t>=28&&t<31)return 'amber';
    return 'red';
  }

  function trafficSignalIsRed(elapsed,signal=null){return trafficSignalPhaseFor(signal,elapsed)==='red';}

  function signalAheadInfo(agent){
    const list=agent.seg.signals||[];if(!list.length)return null;
    const len=Math.hypot(agent.seg.bx-agent.seg.ax,agent.seg.bz-agent.seg.az)||1;let best=null;
    for(const signal of list){
      const dt=(signal.t-agent.t)*agent.dir;
      if(dt<=0)continue;
      const distance=dt*len;
      if(!best||distance<best.distance)best={signal,distance};
    }
    return best;
  }

  function busStopAheadInfo(agent){
    if(agent.type!=='bus')return null;
    const list=agent.seg.busStops||[];if(!list.length)return null;
    const len=Math.hypot(agent.seg.bx-agent.seg.ax,agent.seg.bz-agent.seg.az)||1;let best=null;
    for(const stop of list){
      if(stop.id===agent.lastBusStopId)continue;
      const dt=(stop.t-agent.t)*agent.dir;if(dt<=0)continue;
      const distance=dt*len;if(!best||distance<best.distance)best={stop,distance};
    }
    return best;
  }

  function trafficDownstreamGap(agent){
    const next=agent.nextLeg;if(!next)return Infinity;
    const seg=next.seg,len=Math.hypot(seg.bx-seg.ax,seg.bz-seg.az)||1,entryT=next.dir>0?0:1;let best=Infinity;
    for(const other of ambientTraffic){
      if(other===agent||other.seg!==seg||other.dir!==next.dir)continue;
      const distance=(other.t-entryT)*next.dir*len;
      if(distance>=0)best=Math.min(best,distance);
    }
    return best;
  }

  function trafficLeaderInLane(agent,laneIndex){
    const seg=agent.seg,len=Math.hypot(seg.bx-seg.ax,seg.bz-seg.az)||1;let best=null;
    for(const other of ambientTraffic){
      if(other===agent||other.seg!==seg||other.dir!==agent.dir)continue;
      if(Math.abs((other.laneFloat??other.laneIndex??0)-laneIndex)>.48)continue;
      const distance=(other.t-agent.t)*agent.dir*len;
      if(distance>0&&(!best||distance<best.distance))best={agent:other,distance};
    }
    return best;
  }

  function trafficLaneClear(agent,laneIndex){
    const seg=agent.seg,len=Math.hypot(seg.bx-seg.ax,seg.bz-seg.az)||1;
    for(const other of ambientTraffic){
      if(other===agent||other.seg!==seg||other.dir!==agent.dir)continue;
      if(Math.abs((other.laneFloat??other.laneIndex??0)-laneIndex)>.52)continue;
      const distance=(other.t-agent.t)*agent.dir*len;
      if(distance>-9&&distance<16)return false;
    }
    return true;
  }

  function updateTrafficLaneIntent(agent,dt,distanceToExit){
    const laneCount=trafficDirectionalLaneCount(agent.seg,agent.dir);
    agent.laneCooldown=Math.max(0,(agent.laneCooldown||0)-dt);
    if(laneCount<=1){agent.targetLane=0;agent.laneIndex=0;return;}

    const next=distanceToExit<62?prepareNextTrafficLeg(agent):agent.nextLeg;
    if(next&&distanceToExit<50&&agent.nextTurn!=='straight'){
      const preferred=trafficPreferredLaneForTurn(agent.seg,agent.dir,agent.nextTurn);
      if(trafficLaneClear(agent,preferred)||distanceToExit<24){agent.targetLane=preferred;agent.laneIndex=preferred;}
      return;
    }

    const leader=trafficLeaderInLane(agent,agent.laneIndex||0);
    if(agent.laneCooldown<=0&&leader&&leader.distance<17&&leader.agent.speed<agent.speed*.90){
      // Singapore keeps left; overtaking moves right, then returns left when clear.
      const overtake=Math.min(laneCount-1,(agent.laneIndex||0)+1);
      if(overtake!==agent.laneIndex&&trafficLaneClear(agent,overtake)){
        agent.targetLane=overtake;agent.laneIndex=overtake;agent.laneCooldown=2.4;agent.returnLaneTimer=1.4;return;
      }
    }

    if((agent.laneIndex||0)>0){
      agent.returnLaneTimer=Math.max(0,(agent.returnLaneTimer||0)-dt);
      if(agent.returnLaneTimer<=0&&agent.laneCooldown<=0){
        const left=(agent.laneIndex||0)-1;
        if(trafficLaneClear(agent,left)){agent.targetLane=left;agent.laneIndex=left;agent.laneCooldown=2.0;}
      }
    }
  }

  function trafficTurnSpeed(agent){
    if(agent.nextTurn==='uturn')return 4.5;
    if(agent.nextTurn==='left'||agent.nextTurn==='right')return /motorway|trunk/.test(agent.seg.type||'')?9.5:7.3;
    return Infinity;
  }

  function lerpAngleRadians(a,b,t){
    let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;
    if(d<-Math.PI)d+=Math.PI*2;
    return a+d*t;
  }

  function ambientTrafficRenderLimit(){
    if(graphicsTier==='performance')return 14;
    if(graphicsTier==='balanced')return 21;
    return MAX_AMBIENT_TRAFFIC;
  }

  function updateAmbientTraffic(dt,elapsed=clock?.elapsedTime||0) {
    if(!trafficMesh||!ambientTraffic.length)return;
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    const carX=car?.position.x,carZ=car?.position.z;
    ambientTraffic.forEach((a,i)=>{
      let seg=a.seg,dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1;
      const spec=trafficVehicleSpec(a.type);
      const distanceToExit=(a.dir>0?1-a.t:a.t)*len;
      if(distanceToExit<62)prepareNextTrafficLeg(a);
      updateTrafficLaneIntent(a,dt,distanceToExit);
      a.laneFloat+=(a.targetLane-a.laneFloat)*Math.min(1,dt*(1/TRAFFIC_LANE_CHANGE_SECONDS)*3.2);

      let target=a.cruise*trafficSpeedFactorForTime()*(1-wetness*.16);
      if(a.nextLeg&&distanceToExit<32)target=Math.min(target,trafficTurnSpeed(a));
      if(a.nextLeg&&distanceToExit<20){
        const downstreamGap=trafficDownstreamGap(a);
        if(downstreamGap<8.5)target=Math.min(target,Math.max(0,(distanceToExit-3.5)*.62));
      }

      const signalInfo=signalAheadInfo(a);
      if(signalInfo){
        const phase=trafficSignalPhaseFor(signalInfo.signal,elapsed);
        const stopForSignal=phase==='red'||(phase==='amber'&&signalInfo.distance<Math.max(8,a.speed*a.speed/10));
        if(stopForSignal&&signalInfo.distance<30)target=Math.min(target,Math.max(0,(signalInfo.distance-3.3)*.68));
      }

      const busStop=busStopAheadInfo(a);
      if(a.dwellUntil>elapsed){target=0;}
      else if(busStop&&busStop.distance<25){
        target=Math.min(target,Math.max(0,(busStop.distance-2.2)*.60));
        if(busStop.distance<2.8&&a.speed<1.35){a.dwellUntil=elapsed+TRAFFIC_BUS_DWELL_SECONDS;a.lastBusStopId=busStop.stop.id;target=0;}
      }

      const leader=trafficLeaderInLane(a,a.laneIndex||0);
      if(leader&&leader.distance<20){
        const safe=TRAFFIC_MIN_GAP_METERS+Math.min(7,a.speed*.34);
        target=Math.min(target,Math.max(0,(leader.distance-safe)*.76+leader.agent.speed*.72));
      }

      // Treat the player's car as another road user instead of letting ambient traffic ghost through it.
      if(Number.isFinite(carX)&&Number.isFinite(carZ)){
        const ux=dx/len*a.dir,uz=dz/len*a.dir,tx=carX-a.x,tz=carZ-a.z;
        const ahead=tx*ux+tz*uz,lateral=Math.abs(tx*(-uz)+tz*ux);
        if(ahead>0&&ahead<17&&lateral<3.2)target=Math.min(target,Math.max(0,(ahead-5.0)*.72));
      }

      const accelRate=1.35*spec.accel,brakeRate=4.4*spec.brake;
      a.speed+=(target-a.speed)*Math.min(1,dt*(target<a.speed?brakeRate:accelRate));
      if(dt>0&&a.dwellUntil<=elapsed)a.t+=a.dir*(a.speed/len)*dt;

      if(a.t>1||a.t<0){
        const previousPose={x:a.x,z:a.z,y:a.y,yaw:a.visualYaw};
        const next=a.nextLeg||chooseNextTrafficLeg(a);
        if(next){
          a.seg=seg=next.seg;a.dir=next.dir;a.t=a.dir>0?0:1;a.nextLeg=null;a.nextTurn='straight';
          const newCount=trafficDirectionalLaneCount(seg,a.dir);a.laneIndex=Math.min(a.laneIndex||0,newCount-1);a.targetLane=a.laneIndex;a.laneFloat=Math.min(a.laneFloat,newCount-1);
          a.cruise=trafficCruiseFor(seg,i+Math.floor(elapsed))*spec.speed;
          if(Number.isFinite(previousPose.x)&&Number.isFinite(previousPose.z))a.turnBlend={...previousPose,startedAt:elapsed,duration:.52};
        }else{respawnTrafficAgent(a,i);seg=a.seg;}
        dx=seg.bx-seg.ax;dz=seg.bz-seg.az;len=Math.hypot(dx,dz)||1;
      }

      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,laneOffset=trafficLaneOffset(seg,a.dir,a.laneFloat||0);
      const desiredX=seg.ax+dx*a.t+nx*laneOffset,desiredZ=seg.az+dz*a.t+nz*laneOffset,desiredY=segmentYAt(seg,a.t);
      if(a.turnBlend){
        const u=THREE.MathUtils.clamp((elapsed-a.turnBlend.startedAt)/a.turnBlend.duration,0,1),smooth=u*u*(3-2*u);
        a.x=THREE.MathUtils.lerp(a.turnBlend.x,desiredX,smooth);a.z=THREE.MathUtils.lerp(a.turnBlend.z,desiredZ,smooth);a.y=THREE.MathUtils.lerp(a.turnBlend.y||0,desiredY,smooth);
        if(u>=1)a.turnBlend=null;
      }else{a.x=desiredX;a.z=desiredZ;a.y=desiredY;}
      const yaw=Math.atan2(dx*a.dir,dz*a.dir);
      a.visualYaw=Number.isFinite(a.visualYaw)?lerpAngleRadians(a.visualYaw,yaw,Math.min(1,dt*6.5)):yaw;
      pos.set(a.x,a.y+spec.y,a.z);quat.setFromAxisAngle(new THREE.Vector3(0,1,0),a.visualYaw);
      if(i>=ambientTrafficRenderLimit())scale.set(.001,.001,.001);
      else scale.set(spec.sx,spec.sy,spec.sz);
      m.compose(pos,quat,scale);trafficMesh.setMatrixAt(i,m);
    });
    trafficMesh.instanceMatrix.needsUpdate=true;
  }

  function carHitsTraffic(x,z,y=carRoadY) {
    for(const a of ambientTraffic){
      const spec=trafficVehicleSpec(a.type);
      if(Math.abs((a.y||0)-y)<1.9&&Math.hypot(x-a.x,z-a.z)<spec.radius)return true;
    }
    return false;
  }


  function updateUserTrafficRuleState(elapsed,roadHit){
    const hideSignal=()=>{if(els.signalIndicator){els.signalIndicator.className='dyn signal hidden';els.signalIndicator.textContent='SIG';}};
    if(!roadHit||!roadHit.seg||roadHit.dist>roadHit.seg.width/2+4||!roadHit.seg.signals?.length){
      userSignalTracker.key='';userSignalTracker.distance=Infinity;hideSignal();return;
    }
    const seg=roadHit.seg,dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1;
    const fx=Math.sin(car.rotation.y),fz=Math.cos(car.rotation.y),dir=(fx*dx+fz*dz)>=0?1:-1;
    let nearest=null;
    for(const signal of seg.signals){
      const distance=(signal.t-roadHit.t)*dir*len;
      if(distance < -8 || distance > 70)continue;
      if(!nearest||Math.abs(distance)<Math.abs(nearest.distance))nearest={signal,distance};
    }
    if(!nearest){userSignalTracker.key='';userSignalTracker.distance=Infinity;hideSignal();return;}
    const phase=trafficSignalPhaseFor(nearest.signal,elapsed);
    if(els.signalIndicator&&nearest.distance>=-1&&nearest.distance<58){
      els.signalIndicator.className=`dyn signal ${phase}`;
      els.signalIndicator.textContent=phase==='amber'?'AMB':phase.toUpperCase();
    }else hideSignal();
    const key=`${nearest.signal.id}:${dir}`;
    if(userSignalTracker.key===key){
      const crossed=userSignalTracker.distance>1.0&&nearest.distance<=-.55;
      if(crossed&&Math.abs(speedMps)>2.2&&phase==='red'&&elapsed-userSignalTracker.violatedAt>2.4){
        recordRedLightViolation(elapsed);
      }
    }
    userSignalTracker.key=key;userSignalTracker.distance=nearest.distance;
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
    updateLightingButton();lastLightingUpdate=-Infinity;showToast(`Lighting · ${lightingMode==='auto'?'Auto':lightingMode}`);
  }

  function updateWorldLighting(dt,elapsed){
    if(elapsed-lastLightingUpdate>.18||lastLightingUpdate<0){
      lastLightingUpdate=elapsed;
      const target=lightingTarget();lightingSunHour=target.hour;
      lightingNightFactor+=(target.night-lightingNightFactor)*Math.min(1,Math.max(.08,dt*3.2));
      const n=lightingNightFactor;
      const profile=visualProfileFor(),warm=new THREE.Color(profile.skyWarm||'#8ab3c3');
      const dayTop=new THREE.Color(0x4f94b5).lerp(warm,.18),dayHorizon=new THREE.Color(0xc7d8d9).lerp(warm,.12),dayBottom=new THREE.Color(0xe5d7c5);
      const duskTop=new THREE.Color(0x4b536f).lerp(warm,.22),duskHorizon=new THREE.Color(0xd59a87),duskBottom=new THREE.Color(0x705a67);
      const nightTop=new THREE.Color(0x030b14),nightHorizon=new THREE.Color(0x122b3b),nightBottom=new THREE.Color(0x09141b);
      const mixSky=(a,b)=>n<.56?a.clone().lerp(b,n/.56):b.clone().lerp(nightTop,(n-.56)/.44);
      let top=n<.56?dayTop.clone().lerp(duskTop,n/.56):duskTop.clone().lerp(nightTop,(n-.56)/.44);
      let horizon=n<.56?dayHorizon.clone().lerp(duskHorizon,n/.56):duskHorizon.clone().lerp(nightHorizon,(n-.56)/.44);
      let bottom=n<.56?dayBottom.clone().lerp(duskBottom,n/.56):duskBottom.clone().lerp(nightBottom,(n-.56)/.44);
      const cloud=THREE.MathUtils.clamp((Number(environmentState.cloudPct)||0)/100,0,1),rainDim=/rain/.test(environmentState.condition||'')?.22:0;
      const overcast=new THREE.Color(0x65757b),dim=Math.max(0,cloud-.35)*.38+rainDim;top.lerp(overcast,dim);horizon.lerp(overcast,dim*.78);bottom.lerp(overcast,dim*.55);
      const sky=horizon.clone().lerp(top,.42);scene.background.copy(sky);
      if(skyUniforms){skyUniforms.topColor.value.copy(top);skyUniforms.horizonColor.value.copy(horizon);skyUniforms.bottomColor.value.copy(bottom);}
      if(scene.fog){scene.fog.color.copy(horizon.clone().lerp(top,.32));scene.fog.density=THREE.MathUtils.lerp(.00118,.00153,n)+wetness*.00046;}
      if(horizonHaze){horizonHaze.material.color.copy(sky.clone().lerp(new THREE.Color(0x6a7c83),.28));horizonHaze.material.opacity=THREE.MathUtils.lerp(.22,.12,n)+wetness*.07;}
      if(hemi)hemi.intensity=THREE.MathUtils.lerp(2.35,.58,n)*(1-cloud*.22-rainDim);
      if(sun){sun.intensity=THREE.MathUtils.lerp(2.25,.15,n)*(1-cloud*.52-rainDim);sun.color.set(n>.32?0xffb56b:0xffeed0);}
      if(shared.windows)shared.windows.emissiveIntensity=THREE.MathUtils.lerp(.06,1.65,n);
      if(shared.storefront)shared.storefront.emissiveIntensity=THREE.MathUtils.lerp(.10,1.28,n);
      if(shared.streetLamp)shared.streetLamp.emissiveIntensity=THREE.MathUtils.lerp(.08,5.2,n);
      if(shared.roadStud)shared.roadStud.emissiveIntensity=THREE.MathUtils.lerp(.34,2.15,n)+wetness*.55;
      if(shared.line)shared.line.opacity=THREE.MathUtils.lerp(.84,.98,n);
      if(shared.route)shared.route.opacity=THREE.MathUtils.lerp(.92,1,n);
      if(shared.tunnelLight)shared.tunnelLight.emissiveIntensity=inTunnel?5.8:3.5;
      if(sunDisc){sunDisc.material.opacity=THREE.MathUtils.clamp(1-n*1.5,0,.92)*(1-cloud*.65);sunDisc.material.color.set(n>.22?0xffb06b:0xffe4a3);}
      if(moonDisc)moonDisc.material.opacity=THREE.MathUtils.clamp((n-.45)/.55,0,.72)*(1-cloud*.55);
      if(carHeadlight)carHeadlight.intensity=n>.35?THREE.MathUtils.lerp(0,34,(n-.35)/.65):0;
      if(inTunnel){if(hemi)hemi.intensity*=.42;if(sun)sun.intensity*=.10;}
      if(renderer)renderer.toneMappingExposure=(THREE.MathUtils.lerp(1.10,.94,n)-wetness*.04)*(inTunnel?.88:1);
    }
  }

  function updateSignalVisual(elapsed){
    const nightBoost=1+lightingNightFactor*.75;
    if(shared.signalRed)shared.signalRed.emissiveIntensity=.72*nightBoost;
    if(shared.signalAmber)shared.signalAmber.emissiveIntensity=.62*nightBoost;
    if(shared.signalGreen)shared.signalGreen.emissiveIntensity=.62*nightBoost;
    if(!trafficSignalVisuals||elapsed-lastSignalVisualUpdate<.11)return;
    lastSignalVisualUpdate=elapsed;
    const {points,reds,ambers,greens}=trafficSignalVisuals;
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    for(let i=0;i<points.length;i++){
      const p=points[i],y=p.y||0,phase=trafficSignalPhaseFor(p,elapsed);
      const setLamp=(mesh,py,active)=>{scale.setScalar(active?1.18:.42);pos.set(p.x,y+py,p.z-.15);m.compose(pos,quat,scale);mesh.setMatrixAt(i,m);};
      setLamp(reds,2.86,phase==='red');setLamp(ambers,2.62,phase==='amber');setLamp(greens,2.38,phase==='green');
    }
    reds.instanceMatrix.needsUpdate=true;ambers.instanceMatrix.needsUpdate=true;greens.instanceMatrix.needsUpdate=true;
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)||location.protocol!=='https:')return;
    navigator.serviceWorker.register(`boot.js?sw=${BUILD_ID}`,{scope:'./'}).then(reg=>{
      reg.update?.().catch(()=>{});
      reg.addEventListener('updatefound',()=>{
        const worker=reg.installing;if(!worker)return;
        worker.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller)showToast('DriveSG update ready for next launch');
        });
      });
    }).catch(err=>recordDiagnostic('service-worker',err?.message||err));
  }

  function createRainSystem(){
    const count=RAIN_PARTICLES_HIGH;
    const positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      positions[i*3]=(pseudoRandom(i*17+1)-.5)*72;
      positions[i*3+1]=6+pseudoRandom(i*29+3)*34;
      positions[i*3+2]=(pseudoRandom(i*41+7)-.5)*88;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const mat=new THREE.PointsMaterial({color:0xbfd8e7,size:.09,transparent:true,opacity:.0,depthWrite:false,sizeAttenuation:true});
    rainPoints=new THREE.Points(geo,mat);rainPoints.visible=false;rainPositions=positions;scene.add(rainPoints);applyGraphicsTier(graphicsTier,{quiet:true});
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
        try{const res=await backendFetch(`/api/environment?lat=${encodeURIComponent(c.lat)}&lon=${encodeURIComponent(c.lon)}`,{headers:{Accept:'application/json'}});if(res.ok)data=await res.json();}
        catch(err){console.warn('DriveSG environment backend bypass',err?.message||err);}
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
    if(shared.road){shared.road.roughness=THREE.MathUtils.lerp(.96,.37,wetness);shared.road.metalness=THREE.MathUtils.lerp(0,.12,wetness);}
    if(shared.majorRoad){shared.majorRoad.roughness=THREE.MathUtils.lerp(.95,.34,wetness);shared.majorRoad.metalness=THREE.MathUtils.lerp(0,.14,wetness);}
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

  function updateNavigationTrafficEstimate(byName){
    if(!navigation.active||navigation.mode!=='route'||!navigation.steps?.length){navigation.trafficMultiplier=1;navigation.trafficLabel='';return;}
    let weighted=0,total=0,matched=0;
    for(const step of navigation.steps){
      const dur=Math.max(0,Number(step.duration)||0),dist=Math.max(0,Number(step.distance)||0);if(dur<=0)continue;
      total+=dur;let factor=1;
      const bands=byName.get(normalizeRoadName(step.name));
      if(bands?.length){
        const speeds=bands.map(b=>{const lo=Number(b.minSpeed),hi=Number(b.maxSpeed);return Number.isFinite(lo)&&Number.isFinite(hi)?(lo+hi)/2:(Number.isFinite(hi)?hi:null);}).filter(Number.isFinite);
        if(speeds.length){
          speeds.sort((a,b)=>a-b);const live=speeds[Math.floor(speeds.length/2)],baseline=THREE.MathUtils.clamp(dist/dur*3.6,28,80);
          factor=THREE.MathUtils.clamp(baseline/Math.max(7,live),.9,2.65);matched+=dur;
        }
      }
      weighted+=dur*factor;
    }
    if(total<=0||matched/total<.06){navigation.trafficMultiplier=1;navigation.trafficLabel='';return;}
    const raw=weighted/total,coverage=matched/total,mult=THREE.MathUtils.lerp(1,raw,THREE.MathUtils.clamp(coverage*1.7,0,1));
    navigation.trafficMultiplier=THREE.MathUtils.clamp(mult,.92,2.45);
    navigation.trafficLabel=navigation.trafficMultiplier>1.55?'HEAVY TRAFFIC':(navigation.trafficMultiplier>1.20?'TRAFFIC':'LIVE');
  }

  function applyLiveTrafficData(data){
    liveTrafficBands=Array.isArray(data?.speedBands)?data.speedBands:[];
    liveTrafficIncidents=Array.isArray(data?.incidents)?data.incidents.filter(i=>Number.isFinite(Number(i.latitude))&&Number.isFinite(Number(i.longitude))):[];
    const byName=new Map();
    for(const b of liveTrafficBands){const k=normalizeRoadName(b.roadName);if(!k)continue;if(!byName.has(k))byName.set(k,[]);byName.get(k).push(b);}
    updateNavigationTrafficEstimate(byName);
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
    try{const res=await backendFetch(`/api/traffic?lat=${encodeURIComponent(c.lat)}&lon=${encodeURIComponent(c.lon)}&radius=2600`,{headers:{Accept:'application/json'}});if(res.ok){const data=await res.json();if(data?.configured)applyLiveTrafficData(data);}}
    catch(err){console.warn('Live traffic refresh failed',err?.message||err);}finally{trafficDataBusy=false;}
  }

  function maybeRefreshLiveTraffic(elapsed){
    if(lastTrafficDataRefresh>=0&&elapsed-lastTrafficDataRefresh<TRAFFIC_REFRESH_SECONDS)return;
    lastTrafficDataRefresh=elapsed;refreshLiveTraffic();
  }

  async function refreshProviderStatus(){
    if(!BACKEND_ACTIVE)return;
    try{
      const res=await backendFetch('/api/health',{headers:{Accept:'application/json'}});if(!res.ok)return;
      const data=await res.json(),providers=data?.providers||{};
      document.documentElement.dataset.ltaTraffic=providers.ltaTraffic?'live':'ready';
      document.documentElement.dataset.mapProvider=oneMapTilesEnabled?'onemap':'osm';
    }catch(_){/* provider status is non-critical */}
  }

  function toggleEngineSound() {
    engineSoundOn=!engineSoundOn;
    if(engineSoundOn)ensureEngineAudio();
    els.soundBtn.classList.toggle('sound-on',engineSoundOn);
    els.soundBtn.textContent='♪';
    updateEngineAudio();
  }

  function makeEngineNoiseBuffer(ctx,duration=1.2){
    const b=ctx.createBuffer(1,Math.max(1,Math.floor(ctx.sampleRate*duration)),ctx.sampleRate),a=b.getChannelData(0);let last=0;
    for(let i=0;i<a.length;i++){const white=Math.random()*2-1;last=last*.83+white*.17;a[i]=last*.72+white*.18;}return b;
  }

  function ensureEngineAudio() {
    if(engineAudio){engineAudio.ctx.resume?.().catch?.(()=>{});return;}
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      const ctx=new AC(),master=ctx.createGain(),engineFilter=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor();
      master.gain.value=.0001;engineFilter.type='lowpass';engineFilter.frequency.value=850;engineFilter.Q.value=.38;
      compressor.threshold.value=-17;compressor.knee.value=14;compressor.ratio.value=3.2;compressor.attack.value=.006;compressor.release.value=.16;
      engineFilter.connect(compressor);compressor.connect(master);master.connect(ctx.destination);

      const real=new Float32Array(9),imag=new Float32Array(9);[0,1,.72,.46,.31,.20,.13,.08,.05].forEach((v,i)=>imag[i]=v);
      const wave=ctx.createPeriodicWave(real,imag,{disableNormalization:false});
      const fireOsc=ctx.createOscillator(),fireGain=ctx.createGain();fireOsc.setPeriodicWave(wave);fireOsc.frequency.value=30;fireGain.gain.value=.018;fireOsc.connect(fireGain);fireGain.connect(engineFilter);fireOsc.start();
      const mechOsc=ctx.createOscillator(),mechGain=ctx.createGain(),mechFilter=ctx.createBiquadFilter();mechOsc.type='triangle';mechOsc.frequency.value=15;mechGain.gain.value=.006;mechFilter.type='bandpass';mechFilter.frequency.value=420;mechFilter.Q.value=.65;mechOsc.connect(mechFilter);mechFilter.connect(mechGain);mechGain.connect(master);mechOsc.start();

      const noiseBuffer=makeEngineNoiseBuffer(ctx,1.3);
      const loadSource=ctx.createBufferSource(),loadFilter=ctx.createBiquadFilter(),loadGain=ctx.createGain();loadSource.buffer=noiseBuffer;loadSource.loop=true;loadFilter.type='bandpass';loadFilter.frequency.value=380;loadFilter.Q.value=.75;loadGain.gain.value=.0001;loadSource.connect(loadFilter);loadFilter.connect(loadGain);loadGain.connect(master);loadSource.start();
      const tyreSource=ctx.createBufferSource(),tyreFilter=ctx.createBiquadFilter(),tyreGain=ctx.createGain();tyreSource.buffer=noiseBuffer;tyreSource.loop=true;tyreFilter.type='bandpass';tyreFilter.frequency.value=760;tyreFilter.Q.value=.55;tyreGain.gain.value=.0001;tyreSource.connect(tyreFilter);tyreFilter.connect(tyreGain);tyreGain.connect(ctx.destination);tyreSource.start();
      const windSource=ctx.createBufferSource(),windFilter=ctx.createBiquadFilter(),windGain=ctx.createGain();windSource.buffer=noiseBuffer;windSource.loop=true;windFilter.type='highpass';windFilter.frequency.value=980;windFilter.Q.value=.3;windGain.gain.value=.0001;windSource.connect(windFilter);windFilter.connect(windGain);windGain.connect(ctx.destination);windSource.start();
      engineAudio={ctx,master,engineFilter,compressor,fireOsc,fireGain,mechOsc,mechGain,mechFilter,loadSource,loadFilter,loadGain,tyreSource,tyreFilter,tyreGain,windSource,windFilter,windGain};
    }catch(err){console.warn('Engine audio unavailable',err);engineSoundOn=false;}
  }

  function updateEngineAudio() {
    if(!engineAudio)return;
    const now=engineAudio.ctx.currentTime,shiftCut=shiftTimer>0?THREE.MathUtils.lerp(.45,.76,1-shiftTimer/SHIFT_DURATION_SECONDS):1;
    const firingHz=THREE.MathUtils.clamp(engineRpm/30,26,225),mechanicalHz=THREE.MathUtils.clamp(engineRpm/60,13,112);
    const tunnelBoost=inTunnel?1.15:1,masterTarget=engineSoundOn?(.022+engineLoad*.029+Math.min(engineRpm/6500,1)*.010)*shiftCut*tunnelBoost:.0001;
    engineAudio.master.gain.setTargetAtTime(masterTarget,now,.045);
    engineAudio.fireOsc.frequency.setTargetAtTime(firingHz,now,.038);engineAudio.fireGain.gain.setTargetAtTime(.020+engineLoad*.018,now,.045);
    engineAudio.mechOsc.frequency.setTargetAtTime(mechanicalHz,now,.055);engineAudio.mechFilter.frequency.setTargetAtTime(260+engineRpm*.065,now,.07);engineAudio.mechGain.gain.setTargetAtTime(engineSoundOn?(.0035+engineRpm/6500*.006):.0001,now,.06);
    engineAudio.engineFilter.frequency.setTargetAtTime(520+engineRpm*.18+engineLoad*420,now,.055);
    engineAudio.loadFilter.frequency.setTargetAtTime(260+engineRpm*.095,now,.06);engineAudio.loadGain.gain.setTargetAtTime(engineSoundOn?(.001+engineLoad*.011)*shiftCut:.0001,now,.055);
    if(engineAudio.windGain){const wind=engineSoundOn?THREE.MathUtils.clamp((Math.pow(Math.abs(speedMps)/34,1.65)*.020+wetness*.0035)*(inTunnel?.38:1),.0001,.024):.0001;engineAudio.windGain.gain.setTargetAtTime(wind,now,.08);engineAudio.windFilter.frequency.setTargetAtTime(900+Math.abs(speedMps)*50,now,.10);}
    if(engineAudio.tyreGain){const scrub=engineSoundOn?THREE.MathUtils.clamp(tyreSlip*.045+(onRoad?wetness*.004:.012)*Math.min(Math.abs(speedMps)/15,1),.0001,.029):.0001;engineAudio.tyreGain.gain.setTargetAtTime(scrub,now,.035);engineAudio.tyreFilter.frequency.setTargetAtTime(620+Math.abs(speedMps)*24+tyreSlip*620,now,.05);}
  }

  function playGearShiftSound(){
    if(!engineSoundOn||!engineAudio?.ctx)return;
    try{const ctx=engineAudio.ctx,now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(92,now);o.frequency.exponentialRampToValueAtTime(48,now+.10);g.gain.setValueAtTime(.020,now);g.gain.exponentialRampToValueAtTime(.0001,now+.13);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+.14);}catch(_){}
  }

  function playCollisionThump() {
    if(!engineSoundOn||!engineAudio?.ctx)return;
    try{
      const ctx=engineAudio.ctx,now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(72,now);osc.frequency.exponentialRampToValueAtTime(38,now+.12);
      gain.gain.setValueAtTime(.055,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.18);
      osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.19);
    }catch(_){}
  }

  function updateCameraButton(){
    if(!els.cameraBtn)return;
    const meta={
      chase:{icon:'◉',label:'Chase'},
      hood:{icon:'▣',label:'Hood'},
      scenic:{icon:'◇',label:'Scenic'}
    }[cameraMode]||{icon:'◉',label:'Chase'};
    els.cameraBtn.textContent=meta.icon;
    els.cameraBtn.title=`Camera: ${meta.label}`;
    els.cameraBtn.setAttribute('aria-label',`Change driving camera. Current: ${meta.label.toLowerCase()}`);
  }

  function cycleCameraMode(){
    cameraMode=cameraMode==='chase'?'hood':(cameraMode==='hood'?'scenic':'chase');
    try{localStorage.setItem('drivesg-camera-mode',cameraMode);}catch(_){}
    updateCameraButton();
    cameraShake=Math.max(cameraShake,.08);
    const label=cameraMode==='hood'?'Hood camera · closer road view':(cameraMode==='scenic'?'Scenic camera':'Chase camera');
    showToast(label);
  }

  function resetDrivingDynamics(){
    lateralSlipMps=0;yawVelocity=0;tyreSlip=0;absActive=false;tcsActive=false;cameraShake=0;roadShock=0;
    suspensionHeave=0;suspensionHeaveVel=0;lastPhysicsSpeedMps=0;lastElevationTarget=carRoadY||0;
    updateDynamicsHud();
  }

  function updateDynamicsHud(){
    if(!els.gripIndicator)return;
    const slipLevel=THREE.MathUtils.clamp(tyreSlip,0,1.4);
    let label='GRIP',state='';
    if(!onRoad){label='LOOSE';state='warn';}
    else if(wetness>.28){label='WET';state=slipLevel>.34?'warn':'wet';}
    else if(slipLevel>.42){label='SLIP';state='warn';}
    els.gripIndicator.textContent=label;
    els.gripIndicator.className=`dyn grip ${state}`.trim();
    els.absIndicator?.classList.toggle('active',absActive);
    els.tcsIndicator?.classList.toggle('active',tcsActive);
  }

  function buildCustomLandmarkColliders(centerX,centerZ,terrainPatch=activeTerrainPatch){
    const out=[];
    for(const lm of LANDMARKS){
      const spec=LANDMARK_COLLIDER_SPECS[lm.kind];if(!spec)continue;
      const p=project(lm.lat,lm.lon);if(Math.hypot(p.x-centerX,p.z-centerZ)>1800)continue;
      const gy=terrainHeightAt(p.x,p.z,terrainPatch),w=spec.w,d=spec.d;
      const pts=[
        {x:p.x-w/2,z:p.z-d/2},{x:p.x+w/2,z:p.z-d/2},
        {x:p.x+w/2,z:p.z+d/2},{x:p.x-w/2,z:p.z+d/2}
      ];
      out.push({
        id:`lm-${lm.kind}`,pts,x:p.x,z:p.z,w,d,h:gy+spec.h,minHeight:gy,groundY:gy,wallTop:gy+spec.h,
        bounds:{minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2},
        distance:Math.hypot(p.x-centerX,p.z-centerZ),bucket:0,visualClass:'landmark',kind:lm.kind
      });
    }
    return out;
  }

  function buildWorld(data, center = {}, terrainPatch = activeTerrainPatch) {
    const centerX = Number.isFinite(center.x) ? center.x : (Number.isFinite(center.centerX) ? center.centerX : 0);
    const centerZ = Number.isFinite(center.z) ? center.z : (Number.isFinite(center.centerZ) ? center.centerZ : 0);
    const normalizedCenter = { x: centerX, z: centerZ };
    const group = new THREE.Group();
    const terrainMesh=buildTerrainMesh(centerX,centerZ,terrainPatch);
    if(terrainMesh)group.add(terrainMesh);
    const segments = [];
    const sidewalkVerts = [];
    const edgeVerts = [];
    const roadVerts = [];
    const curbVerts = [];
    const majorVerts = [];
    const lineVerts = [];
    const medianVerts = [];
    const bridgeStructureVerts = [];
    const tunnelStructureVerts = [];
    const waterVerts = [];
    const parkVerts = [];
    const buildingVerts = Array.from({length:8},()=>[]);
    const windowVerts = [];
    const storefrontVerts = [];
    const hdbDetailVerts = [];
    const officeBandVerts = [];
    const awningVerts = [];
    const rooftopVerts = [];
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
        if(!insideSingapore(el.lat,el.lon))continue;
        const p=project(el.lat,el.lon),dist=Math.hypot(p.x-centerX,p.z-centerZ);
        if(tags.highway==='traffic_signals'&&dist<=SIGNAL_RADIUS_METERS+80&&signalPoints.length<MAX_TRAFFIC_SIGNALS){signalPoints.push({...p,id:el.id});continue;}
        if(tags.highway==='crossing'&&dist<=SIGNAL_RADIUS_METERS+80&&crossingPoints.length<MAX_CROSSINGS){crossingPoints.push(p);continue;}
        if(tags.highway==='bus_stop'&&dist<=SIGNAL_RADIUS_METERS+80&&busStopPoints.length<MAX_BUS_STOPS){busStopPoints.push({...p,id:el.id});continue;}
      }
      if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;

      if (tags.highway) {
        const type = tags.highway;
        const width = widthForRoad(tags);
        const major = isMajorRoad(type);
        const roadY = roadElevationForTags(tags);
        const lanes = laneCountForRoad(tags);
        const oneway=tags.oneway||(tags.junction==='roundabout'?'yes':'');
        const isBridge=roadIsBridge(tags);
        const isTunnel=roadIsTunnel(tags);
        if(isTunnel || /motorway|trunk/.test(type)) continue; // focused town build: no tunnels or expressways
        const points = cleanPolyline(el.geometry.map(q => {
          const p=project(q.lat,q.lon);
          return {...p,y:terrainHeightAt(p.x,p.z,terrainPatch)+roadY};
        }));
        if (points.length < 2) continue;
        if(isBridge&&points.length>=3){
          const layer=parseRoadLayer(tags.layer),approachY=Math.max(0,(layer-1)*3.35);
          points[0].y=terrainHeightAt(points[0].x,points[0].z,terrainPatch)+approachY;
          points[points.length-1].y=terrainHeightAt(points[points.length-1].x,points[points.length-1].z,terrainPatch)+approachY;
        }

        // Pavement/shoulder first, then curb/edge, then asphalt. Terrain height is carried
        // by every road point so sloped Singapore roads remain continuously drivable.
        const y0=points[0].y||0;
        if(!/motorway/.test(type)) appendRoadRibbon(sidewalkVerts, points, width + (major ? 3.3 : 4.8), y0 + .006, true);
        appendRoadRibbon(edgeVerts, points, width + (major ? 1.7 : 2.15), y0 + .019, true);
        appendRoadRibbon(major ? majorVerts : roadVerts, points, width, y0 + .043, true);
        if(lanes>=4&&!/^(yes|1|-1)$/.test(String(oneway))&&!isTunnel) appendRoadRibbon(medianVerts,points,Math.min(1.35,width*.09),y0+.072,false);

        const waySegments = [];
        const nodeIds=Array.isArray(el.nodes)?el.nodes:[];
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const length = Math.hypot(dx, dz);
          if (length < .6 || length > 1500) continue;
          const midGeo=unproject((a.x+b.x)/2,(a.z+b.z)/2);
          if(!insideSingapore(midGeo.lat,midGeo.lon))continue;
          const fromKey=nodeIds[i]!=null?`n${nodeIds[i]}`:graphPointKey(a.x,a.z);
          const toKey=nodeIds[i+1]!=null?`n${nodeIds[i+1]}`:graphPointKey(b.x,b.z);
          const seg = {
            ax:a.x, az:a.z, bx:b.x, bz:b.z, width, major, lanes, type,
            ay:Number.isFinite(a.y)?a.y:roadY, by:Number.isFinite(b.y)?b.y:roadY, y:((Number.isFinite(a.y)?a.y:roadY)+(Number.isFinite(b.y)?b.y:roadY))/2, bridge:isBridge, tunnel:isTunnel, layer:parseRoadLayer(tags.layer),
            fromKey,toKey,
            oneway,
            lanesForward: parseLaneNumber(tags['lanes:forward']),
            lanesBackward: parseLaneNumber(tags['lanes:backward']),
            turnLanes: tags['turn:lanes']||'',
            turnLanesForward: tags['turn:lanes:forward']||'',
            turnLanesBackward: tags['turn:lanes:backward']||'',
            name: roadDisplayName(tags),
            ref: tags.ref || '',
            destination: tags.destination || tags['destination:ref'] || '',
            speedLimit: parseSpeedLimit(tags.maxspeed)
          };
          segments.push(seg);
          waySegments.push(seg);
          if(isBridge)appendBridgeStructure(bridgeStructureVerts,seg);
          else if(/motorway|trunk/.test(type)&&!isTunnel)appendExpresswayGuardrails(bridgeStructureVerts,seg);
          if(isTunnel)appendTunnelStructure(tunnelStructureVerts,seg);
        }
        appendWayLaneMarkings(lineVerts, waySegments, width, lanes, oneway);
        if(!/motorway|trunk/.test(type)){for(const seg of waySegments){const off=Math.max(.85,seg.width/2+.22);appendOffsetSolidLine(curbVerts,seg,off,.11);appendOffsetSolidLine(curbVerts,seg,-off,.11);}}
        roadCount++;
      } else if (tags.building || tags['building:part']) {
        const b = buildingDescriptor(el, normalizedCenter, terrainPatch);
        if (b) buildingDescriptors.push(b);
      } else if (isWaterFeature(tags)) {
        const pts = cleanPolygon(el.geometry.map(p => project(p.lat, p.lon)));
        const wy=pts.length?pts.reduce((sum,p)=>sum+terrainHeightAt(p.x,p.z,terrainPatch),0)/pts.length:0;
        if (appendFlatPolygon(waterVerts, pts, wy+0.004)) { waterCount++; waterPolygons.push(pts); }
      } else if (isParkFeature(tags)) {
        const pts = cleanPolygon(el.geometry.map(p => project(p.lat, p.lon)));
        const py=pts.length?pts.reduce((sum,p)=>sum+terrainHeightAt(p.x,p.z,terrainPatch),0)/pts.length:0;
        if (appendFlatPolygon(parkVerts, pts, py+.012)) { parkCount++; parkPolygons.push(pts); }
      }
    }

    if (sidewalkVerts.length) group.add(meshFromFlatVertices(sidewalkVerts, shared.sidewalk, true));
    if (edgeVerts.length) group.add(meshFromFlatVertices(edgeVerts, shared.roadEdge, true));
    if (roadVerts.length) group.add(meshFromFlatVertices(roadVerts, shared.road, true));
    if (majorVerts.length) group.add(meshFromFlatVertices(majorVerts, shared.majorRoad, true));
    if (curbVerts.length){const curb=meshFromFlatVertices(curbVerts,shared.curb,true);curb.renderOrder=2;group.add(curb);}
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
    const landmarkColliders=buildCustomLandmarkColliders(centerX,centerZ,terrainPatch);
    const collisionBuildings=selectedBuildings.concat(landmarkColliders);
    const windowBudget={count:0},detailBudget={count:0},roofBudget={count:0};
    selectedBuildings.forEach((b,index) => {
      appendBuildingGeometry(buildingVerts[b.bucket], b);
      if(index<MAX_FACADE_BUILDINGS&&windowBudget.count<MAX_BUILDING_WINDOWS)appendBuildingFacade(windowVerts,storefrontVerts,b,windowBudget);
      if(index<MAX_FACADE_BUILDINGS&&detailBudget.count<MAX_FACADE_DETAILS)appendBuildingIdentityDetails(hdbDetailVerts,officeBandVerts,awningVerts,b,detailBudget);
      if(index<520&&roofBudget.count<1100)appendRooftopDetails(rooftopVerts,b,roofBudget);
    });
    buildingVerts.forEach((verts, bucket) => {
      if (!verts.length) return;
      const mesh = meshFromFlatVertices(verts, shared.buildings[bucket], true);
      mesh.castShadow = false;
      group.add(mesh);
    });
    if(windowVerts.length){const mesh=meshFromFlatVertices(windowVerts,shared.windows,false);mesh.renderOrder=3;mesh.userData.qualityLayer='micro';group.add(mesh);}
    if(storefrontVerts.length){const mesh=meshFromFlatVertices(storefrontVerts,shared.storefront,false);mesh.renderOrder=3;mesh.userData.qualityLayer='detail';group.add(mesh);}
    if(hdbDetailVerts.length){const mesh=meshFromFlatVertices(hdbDetailVerts,shared.hdbCorridor,false);mesh.renderOrder=3;mesh.userData.qualityLayer='detail';group.add(mesh);}
    if(officeBandVerts.length){const mesh=meshFromFlatVertices(officeBandVerts,shared.officeBand,false);mesh.renderOrder=3;mesh.userData.qualityLayer='micro';group.add(mesh);}
    if(awningVerts.length){const mesh=meshFromFlatVertices(awningVerts,shared.awning,false);mesh.renderOrder=4;mesh.userData.qualityLayer='detail';group.add(mesh);}
    if(rooftopVerts.length){const mesh=meshFromFlatVertices(rooftopVerts,shared.rooftop,true);mesh.userData.qualityLayer='detail';group.add(mesh);}
    const blockNumberSignCount=addHdbBlockNumberSigns(group,selectedBuildings);

    const signalDescriptors=mapSignalsToSegments(signalPoints,segments);
    const busStopDescriptors=mapBusStopsToSegments(busStopPoints,segments);
    const roadGraphBuilt=buildRoadGraph(segments);
    const signalBuild = addTrafficSignals(group, signalDescriptors);
    const trafficSignalCount = signalBuild.count;
    const crossingCount = addPedestrianCrossings(group,crossingPoints,segments);
    const junctionMarkingCount = addJunctionRoadMarkings(group,segments,signalDescriptors);
    const busStopCount = addBusStops(group,busStopDescriptors);
    const streetLightCount=addStreetLights(group,segments,centerX,centerZ,selectedBuildings);
    const tunnelLightCount=addTunnelLighting(group,segments);
    const roadStudCount=addExpresswayRoadStuds(group,segments);
    const gantryCount=addRoadGantries(group,segments,centerX,centerZ);
    const roadSignCount=addRoadNameSigns(group,segments,centerX,centerZ);
    const treeCount = addRoadsideTrees(group, segments, centerX, centerZ, collisionBuildings, terrainPatch);
    const tropicalPlantCount=addTropicalVegetation(group,segments,parkPolygons,waterPolygons,centerX,centerZ,collisionBuildings,terrainPatch);
    addLandmarksTo(group,centerX,centerZ,terrainPatch);
    return {
      group, segments, roadGraph:roadGraphBuilt, signalDescriptors, busStopDescriptors, signalVisuals:signalBuild.visuals, roadCount,
      buildingCount: selectedBuildings.length,
      buildingColliders: collisionBuildings,
      waterPolygons, parkPolygons,
      treeCount, tropicalPlantCount, streetLightCount, tunnelLightCount, roadStudCount, gantryCount, roadSignCount, blockNumberSignCount, junctionMarkingCount, waterCount, parkCount, trafficSignalCount, crossingCount, busStopCount,
      terrainPatch
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
      p.y=segmentYAt(hit.seg,hit.t);
      const d={x:p.x,z:p.z,y:p.y,id:p.id||`sig-${out.length}`,seg:hit.seg,t:hit.t,phaseGroup:0,phaseOffset:0};
      hit.seg.signals.push(d);out.push(d);
    }
    assignTrafficSignalPhases(out);
    return out;
  }

  function assignTrafficSignalPhases(signals){
    const clusters=[];
    for(const signal of signals){
      let cluster=clusters.find(c=>Math.hypot(signal.x-c.x,signal.z-c.z)<34);
      if(!cluster){
        cluster={x:signal.x,z:signal.z,items:[],baseAngle:null,phaseOffset:pseudoRandom(signal.x*.071+signal.z*.053)*TRAFFIC_SIGNAL_CYCLE_SECONDS};
        clusters.push(cluster);
      }
      cluster.items.push(signal);
      cluster.x+=(signal.x-cluster.x)/cluster.items.length;cluster.z+=(signal.z-cluster.z)/cluster.items.length;
    }
    clusters.forEach((cluster,clusterIndex)=>{
      for(const signal of cluster.items){
        const dx=signal.seg.bx-signal.seg.ax,dz=signal.seg.bz-signal.seg.az;
        let angle=Math.atan2(dz,dx);while(angle<0)angle+=Math.PI;while(angle>=Math.PI)angle-=Math.PI;
        if(cluster.baseAngle==null)cluster.baseAngle=angle;
        let diff=Math.abs(angle-cluster.baseAngle);diff=Math.min(diff,Math.PI-diff);
        signal.phaseGroup=diff>Math.PI/4?1:0;
        signal.phaseOffset=cluster.phaseOffset;
        signal.clusterId=clusterIndex;
      }
    });
  }

  function addHdbBlockNumberSigns(group,buildings){
    const candidates=(buildings||[]).filter(b=>b.visualClass==='hdb'&&b.blockNumber&&b.distance<720&&b.pts?.length>=3).slice(0,28);
    let count=0;
    for(const b of candidates){
      let best=null,bestLen=0;
      const areaSign=polygonArea(b.pts)>=0?1:-1;
      for(let i=0;i<b.pts.length;i++){
        const a=b.pts[i],c=b.pts[(i+1)%b.pts.length],dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz);
        if(len>bestLen){bestLen=len;best={a,c,dx,dz,len};}
      }
      if(!best||best.len<7)continue;
      const {a,c,dx,dz,len}=best,nx=(areaSign>0?dz:-dz)/len,nz=(areaSign>0?-dx:dx)/len;
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
      const ctx=canvas.getContext('2d');if(!ctx)continue;
      ctx.fillStyle='#f4efe5';ctx.fillRect(0,0,256,128);
      ctx.fillStyle='#9d4f3d';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 76px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
      ctx.fillText(b.blockNumber,128,67,220);
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
      const mat=new THREE.MeshBasicMaterial({map:tex,toneMapped:false,side:THREE.DoubleSide});
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.9,1.95),mat);
      sign.position.set((a.x+c.x)/2+nx*.075,(b.groundY||0)+Math.min(10.2,Math.max(5.8,(b.wallTop-(b.groundY||0))*.28)),(a.z+c.z)/2+nz*.075);
      sign.rotation.y=Math.atan2(nx,nz);sign.renderOrder=5;sign.userData.ephemeralTexture=tex;sign.userData.qualityLayer='detail';
      group.add(sign);count++;
    }
    return count;
  }

  function mapBusStopsToSegments(points,segments){
    for(const seg of segments)seg.busStops=[];
    const out=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],hit=nearestRoadHitInSegments(p.x,p.z,segments);if(!hit||hit.dist>18)continue;
      p.y=segmentYAt(hit.seg,hit.t);const d={x:p.x,z:p.z,y:p.y,id:p.id||`bus-${i}`,seg:hit.seg,t:hit.t};
      hit.seg.busStops.push(d);out.push(d);
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
    const office=[1,4,6,7].includes(b.bucket),commercial=/retail|commercial|mall|hotel/.test(String(b.kind||''));
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
      const relMin=b.minHeight-(b.groundY||0),groundY=b.groundY||0;
      if(commercial&&relMin<1&&b.distance<300){
        const cols2=Math.min(8,Math.max(1,Math.floor(len/5.2)));
        for(let col=0;col<cols2;col++){
          const t=(col+.5)/cols2,cx=a.x+dx*t+nx*.052,cz=a.z+dz*t+nz*.052,hw=Math.min(2.0,len/cols2*.38),cy=groundY+1.75,hh=1.45;
          const l=[cx-ux*hw,cy-hh,cz-uz*hw],r=[cx+ux*hw,cy-hh,cz+uz*hw],rt=[cx+ux*hw,cy+hh,cz+uz*hw],lt=[cx-ux*hw,cy+hh,cz-uz*hw];
          pushTri(storeOut,l,r,rt);pushTri(storeOut,l,rt,lt);
        }
      }
    }
  }


  function appendBuildingIdentityDetails(hdbOut,officeOut,awningOut,b,budget){
    if(!b?.pts?.length||b.distance>1050||budget.count>=MAX_FACADE_DETAILS)return;
    const cls=b.visualClass||'generic',height=b.wallTop-b.minHeight,groundY=b.groundY||0,relMin=b.minHeight-(b.groundY||0);
    if(height<6)return;
    const areaSign=polygonArea(b.pts)>=0?1:-1;
    for(let ei=0;ei<b.pts.length&&budget.count<MAX_FACADE_DETAILS;ei++){
      const a=b.pts[ei],c=b.pts[(ei+1)%b.pts.length],dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz);
      if(len<7)continue;
      const ux=dx/len,uz=dz/len,nx=(areaSign>0?dz:-dz)/len,nz=(areaSign>0?-dx:dx)/len;
      const rect=(out,t0,t1,y0,y1,offset=.058)=>{
        const x0=a.x+dx*t0+nx*offset,z0=a.z+dz*t0+nz*offset,x1=a.x+dx*t1+nx*offset,z1=a.z+dz*t1+nz*offset;
        pushTri(out,[x0,y0,z0],[x1,y0,z1],[x1,y1,z1]);pushTri(out,[x0,y0,z0],[x1,y1,z1],[x0,y1,z0]);budget.count++;
      };
      if(cls==='hdb'){
        // Singapore public housing reads strongly through long access-corridor / balcony bands.
        // Keep these sparse and horizontal so they survive at driving distance without exploding geometry.
        if(relMin<.5&&b.distance<280)rect(officeOut,.035,.965,groundY+.42,groundY+2.45,.059); // void-deck shadow cue
        const start=b.minHeight+6.2,step=b.distance<230?9.15:12.2;
        for(let y=start;y<b.wallTop-1.4&&budget.count<MAX_FACADE_DETAILS;y+=step){
          rect(hdbOut,.045,.955,y,y+.34,.062);
          if(b.distance<230&&len>18)rect(hdbOut,.08,.92,y+1.05,y+1.22,.064);
        }
        // Vertical end/service-core strips are common enough to help HDB blocks read as HDBs.
        if(len>22&&b.wallTop>20&&budget.count<MAX_FACADE_DETAILS){
          rect(hdbOut,.055,.105,b.minHeight+2.2,b.wallTop-.8,.061);
          rect(hdbOut,.895,.945,b.minHeight+2.2,b.wallTop-.8,.061);
        }
      }else if(cls==='office'){
        const step=b.distance<250?6.1:9.15;
        for(let y=b.minHeight+5.4;y<b.wallTop-1&&budget.count<MAX_FACADE_DETAILS;y+=step)rect(officeOut,.025,.975,y,y+.28,.061);
        if(len>26&&b.distance<250&&budget.count<MAX_FACADE_DETAILS)rect(officeOut,.49,.51,b.minHeight+1,b.wallTop-.7,.064);
      }else if(cls==='retail'&&relMin<1.5&&b.distance<300){
        const bays=Math.min(6,Math.max(1,Math.floor(len/8)));
        for(let k=0;k<bays&&budget.count<MAX_FACADE_DETAILS;k++){
          const t0=(k+.13)/bays,t1=(k+.87)/bays;
          rect(awningOut,t0,t1,groundY+3.55,groundY+3.88,.067);
        }
      }else if(cls==='industrial'&&b.distance<260){
        const bays=Math.min(5,Math.max(1,Math.floor(len/11)));
        for(let k=0;k<bays&&budget.count<MAX_FACADE_DETAILS;k++){
          const t0=(k+.16)/bays,t1=(k+.84)/bays;
          rect(officeOut,t0,t1,groundY+4.2,groundY+4.48,.059);
        }
      }
    }
  }

  function addTunnelLighting(group,segments){
    const items=[];
    for(const seg of segments){
      if(!seg.tunnel)continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<7)continue;
      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,yaw=Math.atan2(dx,dz);
      const steps=Math.max(1,Math.floor(len/13));
      for(let i=1;i<=steps;i++){
        const t=i/(steps+1),x=seg.ax+dx*t,z=seg.az+dz*t,y=segmentYAt(seg,t)+3.08;
        const side=Math.max(1.3,Math.min(seg.width*.28,3.5));
        items.push({x:x+nx*side,z:z+nz*side,y,yaw},{x:x-nx*side,z:z-nz*side,y,yaw});
        if(items.length>=150)break;
      }
      if(items.length>=150)break;
    }
    if(!items.length)return 0;
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,.075,.92),shared.tunnelLight,items.length);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),axis=new THREE.Vector3(0,1,0);
    items.forEach((it,i)=>{pos.set(it.x,it.y,it.z);quat.setFromAxisAngle(axis,it.yaw);m.compose(pos,quat,scale);mesh.setMatrixAt(i,m);});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.qualityLayer='detail';group.add(mesh);return items.length;
  }

  function addExpresswayRoadStuds(group,segments){
    const items=[];
    for(const seg of segments){
      if(seg.tunnel||!/motorway|trunk/.test(seg.type||''))continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<18)continue;
      const nx=-dz/len,nz=dx/len,yaw=Math.atan2(dx,dz),steps=Math.max(1,Math.floor(len/20));
      for(let i=1;i<=steps;i++){
        const t=i/(steps+1),x=seg.ax+dx*t,z=seg.az+dz*t,y=segmentYAt(seg,t)+.105,side=Math.max(1.5,seg.width/2-.42);
        items.push({x:x+nx*side,z:z+nz*side,y,yaw},{x:x-nx*side,z:z-nz*side,y,yaw});
        if(items.length>=180)break;
      }
      if(items.length>=180)break;
    }
    if(!items.length)return 0;
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.10,.022,.25),shared.roadStud,items.length);
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),axis=new THREE.Vector3(0,1,0);
    items.forEach((it,i)=>{pos.set(it.x,it.y,it.z);quat.setFromAxisAngle(axis,it.yaw);m.compose(pos,quat,scale);mesh.setMatrixAt(i,m);});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.qualityLayer='micro';group.add(mesh);return items.length;
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
      const s=it.seg,dx=s.bx-s.ax,dz=s.bz-s.az,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,ux=dx/len,uz=dz/len,x=s.ax+dx*it.t,z=s.az+dz*it.t,y=s.y||0,yaw=Math.atan2(dx,dz);
      quat.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);pos.set(x,y+5.35,z);m.compose(pos,quat,scale);signs.setMatrixAt(i,m);
      for(const side of [-1,1]){pos.set(x+nx*(s.width/2+.75)*side,y+2.9,z+nz*(s.width/2+.75)*side);m.compose(pos,quat,scale);poles.setMatrixAt(pi++,m);}
      const label=String(s.destination||s.name||s.ref||'Toa Payoh').trim();
      const tex=makeRoadSignTexture(label,s.ref||'');
      if(tex){
        const mat=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,toneMapped:false});
        const face=new THREE.Mesh(new THREE.PlaneGeometry(8.15,1.76),mat);
        face.position.set(x-ux*.135,y+5.35,z-uz*.135);face.rotation.y=yaw;group.add(face);
      }
    });
    [signs,poles].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});return items.length;
  }


  function makeRoadSignTexture(label,sub=''){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=144;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.fillStyle='#17633f';ctx.fillRect(0,0,512,144);
    ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=5;ctx.strokeRect(8,8,496,128);
    const clean=String(label||'Toa Payoh').replace(/\s+/g,' ').trim();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
    let size=clean.length>25?34:clean.length>17?40:47;
    ctx.font=`800 ${size}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    ctx.fillText(clean.slice(0,34),256,sub?57:72,472);
    if(sub){ctx.font='700 25px -apple-system, BlinkMacSystemFont, Arial, sans-serif';ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillText(String(sub).slice(0,32),256,107,470);}
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
    return tex;
  }

  function addRoadNameSigns(group,segments,centerX,centerZ){
    const used=new Set(),items=[];
    const sorted=[...segments].sort((a,b)=>{
      const am=(/motorway|trunk|primary/.test(a.type)?0:1),bm=(/motorway|trunk|primary/.test(b.type)?0:1);
      if(am!==bm)return am-bm;
      const ad=Math.hypot((a.ax+a.bx)/2-centerX,(a.az+a.bz)/2-centerZ),bd=Math.hypot((b.ax+b.bx)/2-centerX,(b.az+b.bz)/2-centerZ);
      return ad-bd;
    });
    for(const seg of sorted){
      const label=String(seg.name||'').trim();if(!label||label==='Toa Payoh road'||used.has(label))continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<32)continue;
      const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2,dist=Math.hypot(mx-centerX,mz-centerZ);if(dist>1350)continue;
      if(!/motorway|trunk|primary|secondary|tertiary/.test(seg.type||'')&&pseudoRandom(seg.ax*.11+seg.az*.17)<.62)continue;
      used.add(label);items.push({seg,label,sub:seg.ref||seg.destination||''});if(items.length>=MAX_ROAD_NAME_SIGNS)break;
    }
    const poleGeo=new THREE.CylinderGeometry(.055,.07,2.5,6);
    for(const it of items){
      const seg=it.seg,dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
      const t=.42+pseudoRandom(seg.ax*.019+seg.az*.013)*.18,x=seg.ax+dx*t,z=seg.az+dz*t,y=segmentYAt(seg,t);
      const side=pseudoRandom(seg.ax*.07-seg.az*.04)>.5?1:-1,off=seg.width/2+2.4;
      const sx=x+nx*off*side,sz=z+nz*off*side,yaw=Math.atan2(dx,dz)+(side<0?Math.PI:0);
      const pole=new THREE.Mesh(poleGeo,shared.gantryPole);pole.position.set(sx,y+1.25,sz);pole.castShadow=false;group.add(pole);
      const tex=makeRoadSignTexture(it.label,it.sub);if(!tex)continue;
      const mat=new THREE.MeshBasicMaterial({map:tex,transparent:false,side:THREE.DoubleSide,toneMapped:false});
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(4.9,1.38),mat);
      plane.position.set(sx,y+2.72,sz);plane.rotation.y=yaw;group.add(plane);
    }
    return items.length;
  }

  function polygonBounds(pts){
    if(!pts?.length)return null;if(pts._visualBounds)return pts._visualBounds;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
    return pts._visualBounds={minX,maxX,minZ,maxZ};
  }

  function nearSurfaceFeature(x,z,polys,pad=10){
    for(const pts of polys||[]){
      const q=polygonBounds(pts);if(!q)continue;
      if(x<q.minX-pad||x>q.maxX+pad||z<q.minZ-pad||z>q.maxZ+pad)continue;
      if(pointInPolygonXZ(x,z,pts))return true;
      if(x>=q.minX-pad&&x<=q.maxX+pad&&z>=q.minZ-pad&&z<=q.maxZ+pad)return true;
    }
    return false;
  }

  function addTropicalVegetation(group,segments,parks,waters,centerX,centerZ,buildings=[],terrainPatch=activeTerrainPatch){
    const palms=[],shrubs=[];
    const centerGeo=unproject(centerX,centerZ),zone=nearestDiscoveryZone(centerGeo.lat,centerGeo.lon),zoneId=zone?.id||'';
    const lushCoastal=false,lushUrban=true; // mature Toa Payoh streets stay consistently green across the focused town
    for(let si=0;si<segments.length&&(palms.length+shrubs.length)<MAX_TROPICAL_PLANTS;si++){
      const seg=segments[si],dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz);if(len<40)continue;
      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,seed=Math.abs(Math.round(seg.ax*11+seg.az*7+si*19));
      const spacing=/primary|secondary|tertiary/.test(seg.type||'')?(lushCoastal?54:(lushUrban?64:72)):(lushCoastal?82:105);
      for(let d=spacing*.5;d<len&&(palms.length+shrubs.length)<MAX_TROPICAL_PLANTS;d+=spacing){
        const side=pseudoRandom(seed+d*3)>.5?1:-1,off=seg.width/2+5.8+pseudoRandom(seed+d*7)*3.4;
        const x=seg.ax+ux*d+nx*off*side,z=seg.az+uz*d+nz*off*side;
        if(Math.hypot(x-centerX,z-centerZ)>1420||pointHitsBuildingBounds(x,z,buildings,2.8))continue;
        const waterfront=nearSurfaceFeature(x,z,waters,16),park=nearSurfaceFeature(x,z,parks,12);
        const boulevard=/primary|secondary/.test(seg.type||'')&&pseudoRandom(seed+d*13)>(lushCoastal?.30:(lushUrban?.48:.62));
        const districtLandscape=(lushCoastal||lushUrban)&&/primary|secondary|tertiary/.test(seg.type||'')&&pseudoRandom(seed+d*29)>.48;
        if(waterfront||park||boulevard||districtLandscape){
          const scale=.78+pseudoRandom(seed+d*17)*.42;
          const y=terrainHeightAt(x,z,terrainPatch);
          const palmBias=lushCoastal?.36:(zoneId==='orchard'?.62:.55);
          if(waterfront||pseudoRandom(seed+d*23)>palmBias)palms.push({x,z,y,scale});
          else shrubs.push({x,z,y,scale:.8+scale*.25});
        }
      }
    }
    if(palms.length){
      const trunkGeo=new THREE.CylinderGeometry(.14,.24,5.2,7),crownGeo=new THREE.ConeGeometry(2.6,1.25,7);
      const trunks=new THREE.InstancedMesh(trunkGeo,shared.treeTrunk,palms.length),crowns=new THREE.InstancedMesh(crownGeo,shared.palmLeaf,palms.length);
      const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
      palms.forEach((t,i)=>{scale.set(t.scale,t.scale,t.scale);pos.set(t.x,(t.y||0)+2.6*t.scale,t.z);m.compose(pos,quat,scale);trunks.setMatrixAt(i,m);
        quat.setFromAxisAngle(new THREE.Vector3(0,1,0),pseudoRandom(i*43)*Math.PI*2);scale.set(t.scale*(.92+pseudoRandom(i+9)*.2),t.scale,t.scale*(.92+pseudoRandom(i+19)*.2));pos.set(t.x,(t.y||0)+5.55*t.scale,t.z);m.compose(pos,quat,scale);crowns.setMatrixAt(i,m);});
      trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;group.add(trunks,crowns);
    }
    if(shrubs.length){
      const geo=new THREE.IcosahedronGeometry(1.15,1),mesh=new THREE.InstancedMesh(geo,shared.treeLeafLight,shrubs.length);
      const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
      shrubs.forEach((t,i)=>{const s=t.scale*(.7+pseudoRandom(i+31)*.4);pos.set(t.x,(t.y||0)+.85*s,t.z);scale.set(s*1.25,s*.82,s);m.compose(pos,quat,scale);mesh.setMatrixAt(i,m);});
      mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }
    return palms.length+shrubs.length;
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

  function parseLaneNumber(raw){
    const n=Number.parseInt(raw,10);
    return Number.isFinite(n)&&n>0?n:null;
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
    if(!segments.length)return;
    if(lanes>=2){
      const offsets=[];
      for(let i=1;i<lanes;i++) offsets.push(-width/2+(width*i/lanes));
      // A mapped one-way carriageway has only same-direction lane dividers. A normal
      // two-way road also uses the center divider from the same calculated offsets.
      for(const seg of segments) for(const offset of offsets) appendOffsetDashes(out,seg,offset);
    }
    for(const seg of segments){
      if(/motorway|trunk|primary/.test(seg.type||'')){
        const edge=Math.max(.7,width/2-.24);
        appendOffsetSolidLine(out,seg,edge,.075);
        appendOffsetSolidLine(out,seg,-edge,.075);
      }
    }
  }

  function appendOffsetSolidLine(out,seg,offset,half=.07){
    const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1;if(len<3)return;
    const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
    const ax=seg.ax+nx*offset,az=seg.az+nz*offset,bx=seg.bx+nx*offset,bz=seg.bz+nz*offset;
    const px=nx*half,pz=nz*half,yA=segmentYAt(seg,0)+.073,yB=segmentYAt(seg,1)+.073;
    pushTri(out,[ax+px,yA,az+pz],[ax-px,yA,az-pz],[bx-px,yB,bz-pz]);
    pushTri(out,[ax+px,yA,az+pz],[bx-px,yB,bz-pz],[bx+px,yB,bz+pz]);
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

  function appendBoxVerts(out,cx,cy,cz,w,h,d){
    const x0=cx-w/2,x1=cx+w/2,y0=cy-h/2,y1=cy+h/2,z0=cz-d/2,z1=cz+d/2;
    const p={lbf:[x0,y0,z1],rbf:[x1,y0,z1],ltf:[x0,y1,z1],rtf:[x1,y1,z1],lbb:[x0,y0,z0],rbb:[x1,y0,z0],ltb:[x0,y1,z0],rtb:[x1,y1,z0]};
    const q=(a,b,c,d)=>{pushTri(out,a,b,c);pushTri(out,a,c,d);};
    q(p.lbf,p.rbf,p.rtf,p.ltf);q(p.rbb,p.lbb,p.ltb,p.rtb);q(p.lbb,p.lbf,p.ltf,p.ltb);q(p.rbf,p.rbb,p.rtb,p.rtf);q(p.ltf,p.rtf,p.rtb,p.ltb);q(p.lbb,p.rbb,p.rbf,p.lbf);
  }

  function appendRooftopDetails(out,b,budget){
    if(!b||b.distance>390||b.w<7||b.d<7||budget.count>=520)return;
    const r1=pseudoRandom(b.id*71),r2=pseudoRandom(b.id*97),cls=b.visualClass||'generic';
    if(r1<.20&&cls!=='hdb'&&cls!=='office')return;
    const w=THREE.MathUtils.clamp(b.w*(cls==='hdb'?.20:.25+r1*.15),3.2,16);
    const d=THREE.MathUtils.clamp(b.d*(cls==='hdb'?.22:.22+r2*.18),3.0,14);
    const h=cls==='office'?THREE.MathUtils.lerp(1.4,3.6,r2):THREE.MathUtils.lerp(1.1,2.5,r2);
    appendBoxVerts(out,b.x,b.h+h/2+.03,b.z,w,h,d);budget.count++;
    if((cls==='hdb'||cls==='office')&&b.w>20&&b.d>14&&budget.count<520&&r2>.35){
      const dx=(r1-.5)*Math.min(b.w*.42,10),dz=(r2-.5)*Math.min(b.d*.36,8);
      appendBoxVerts(out,b.x+dx,b.h+.65,b.z+dz,Math.max(2.2,w*.48),1.25,Math.max(2,d*.52));budget.count++;
    }
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
    if(!points.length)return {count:0,visuals:null};
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
      const p=points[i],y=p.y||0;
      pos.set(p.x,y+1.275,p.z);m.compose(pos,quat,scale);poles.setMatrixAt(i,m);
      pos.set(p.x,y+2.62,p.z);m.compose(pos,quat,scale);heads.setMatrixAt(i,m);
      pos.set(p.x,y+2.86,p.z-.15);m.compose(pos,quat,scale);reds.setMatrixAt(i,m);
      pos.set(p.x,y+2.62,p.z-.15);m.compose(pos,quat,scale);ambers.setMatrixAt(i,m);
      pos.set(p.x,y+2.38,p.z-.15);m.compose(pos,quat,scale);greens.setMatrixAt(i,m);
    }
    [poles,heads,reds,ambers,greens].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});
    return {count,visuals:{points:points.slice(0,count),poles,heads,reds,ambers,greens}};
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


  function appendRoadMarkingRect(out,cx,cz,ux,uz,nx,nz,alongHalf,acrossHalf,y){
    const a=[cx-ux*alongHalf-nx*acrossHalf,y,cz-uz*alongHalf-nz*acrossHalf];
    const b=[cx-ux*alongHalf+nx*acrossHalf,y,cz-uz*alongHalf+nz*acrossHalf];
    const c=[cx+ux*alongHalf+nx*acrossHalf,y,cz+uz*alongHalf+nz*acrossHalf];
    const d=[cx+ux*alongHalf-nx*acrossHalf,y,cz+uz*alongHalf-nz*acrossHalf];
    pushTri(out,a,b,c);pushTri(out,a,c,d);
  }

  function appendDirectionArrow(out,seg,t,laneOffset=0,kind='straight'){
    const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
    const cx=seg.ax+dx*t+nx*laneOffset,cz=seg.az+dz*t+nz*laneOffset,y=segmentYAt(seg,t)+.086;
    appendRoadMarkingRect(out,cx-ux*.7,cz-uz*.7,ux,uz,nx,nz,1.45,.11,y);
    const tip=[cx+ux*1.55,y,cz+uz*1.55],left=[cx+ux*.55+nx*.58,y,cz+uz*.55+nz*.58],right=[cx+ux*.55-nx*.58,y,cz+uz*.55-nz*.58];
    pushTri(out,tip,left,right);
    if(kind==='left'||kind==='right'){
      const side=kind==='left'?1:-1;
      const bx=cx+ux*.2+nx*side*.25,bz=cz+uz*.2+nz*side*.25;
      const p1=[bx,y,bz],p2=[bx+nx*side*.92,y,bz+nz*side*.92],p3=[bx+ux*.55+nx*side*.65,y,bz+uz*.55+nz*side*.65];
      pushTri(out,p1,p2,p3);
    }
  }

  function addJunctionRoadMarkings(group,segments,signals=[]){
    const white=[],yellow=[];let count=0;
    const signalClusters=new Map();
    for(const sig of signals){
      const key=String(sig.clusterId??sig.id);
      if(!signalClusters.has(key))signalClusters.set(key,[]);
      signalClusters.get(key).push(sig);
      const seg=sig.seg;if(!seg)continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
      const t=THREE.MathUtils.clamp(sig.t-.018,0.03,.97),cx=seg.ax+dx*t,cz=seg.az+dz*t,y=segmentYAt(seg,t)+.085;
      appendRoadMarkingRect(white,cx,cz,ux,uz,nx,nz,.19,Math.max(1.9,seg.width*.46),y);
      if(seg.lanes>=2&&len>25){
        const offset=trafficLaneOffset(seg,1,0);
        const raw=String(seg.turnLanesForward||seg.turnLanes||'').toLowerCase();
        const kind=raw.includes('left')&&!raw.includes('right')?'left':raw.includes('right')&&!raw.includes('left')?'right':'straight';
        appendDirectionArrow(white,seg,THREE.MathUtils.clamp(sig.t-.075,.08,.9),offset,kind);
      }
      count++;
    }
    // Singapore's yellow box-junction language is visually distinctive. Approximate it only
    // at true multi-approach signal clusters to avoid painting every minor crossing.
    for(const list of signalClusters.values()){
      if(list.length<2)continue;
      let cx=0,cz=0;for(const s of list){cx+=s.x;cz+=s.z;}cx/=list.length;cz/=list.length;
      const first=list[0].seg;if(!first)continue;
      const dx=first.bx-first.ax,dz=first.bz-first.az,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
      const size=THREE.MathUtils.clamp(Math.max(...list.map(s=>s.seg?.width||6))*1.05,6.5,13),y=(first.y||0)+.087;
      for(const sign of [-1,1]){
        for(let off=-size*.34;off<=size*.34;off+=size*.34){
          const sx=cx+nx*off,sz=cz+nz*off;
          const aCx=sx+ux*off*sign*.12,aCz=sz+uz*off*sign*.12;
          const dUx=(ux+nx*sign),dUz=(uz+nz*sign),dl=Math.hypot(dUx,dUz)||1;
          appendRoadMarkingRect(yellow,aCx,aCz,dUx/dl,dUz/dl,-dUz/dl,dUx/dl,size*.58,.055,y);
        }
      }
    }
    if(white.length){const m=meshFromFlatVertices(white,shared.line,false);m.renderOrder=6;group.add(m);}
    if(yellow.length){const m=meshFromFlatVertices(yellow,shared.markingYellow,false);m.renderOrder=6;group.add(m);}
    return count;
  }

  function addBusStops(group,points) {
    const count=Math.min(points.length,MAX_BUS_STOPS);if(!count)return 0;
    const poleGeo=new THREE.CylinderGeometry(.055,.07,2.35,6),signGeo=new THREE.BoxGeometry(.55,.42,.10);
    const poles=new THREE.InstancedMesh(poleGeo,shared.busStopPole,count),signs=new THREE.InstancedMesh(signGeo,shared.busStopSign,count);
    const shelterItems=[],yellow=[];
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
    for(let i=0;i<count;i++){
      const p=points[i],seg=p.seg;
      let sx=p.x,sz=p.z,y=p.y||0,yaw=0,side=1,nx=1,nz=0;
      if(seg){
        const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,len=Math.hypot(dx,dz)||1;nx=-dz/len;nz=dx/len;
        const rawSide=(p.x-(seg.ax+dx*(p.t||0)))*nx+(p.z-(seg.az+dz*(p.t||0)))*nz;side=rawSide>=0?1:-1;
        const off=seg.width/2+2.1;sx=seg.ax+dx*(p.t||0)+nx*off*side;sz=seg.az+dz*(p.t||0)+nz*off*side;y=segmentYAt(seg,p.t||0);
        yaw=Math.atan2(dx,dz);
        const ux=dx/len,uz=dz/len,laneEdge=(seg.width/2-.32)*side;
        for(let k=-3;k<=3;k++){
          const along=k*2.45,t0=THREE.MathUtils.clamp((p.t||0)+(along-1.15)/len,0,1),t1=THREE.MathUtils.clamp((p.t||0)+(along+1.15)/len,0,1);
          const baseX=seg.ax+dx*(p.t||0)+nx*laneEdge,baseZ=seg.az+dz*(p.t||0)+nz*laneEdge;
          const ax=baseX+ux*(along-1.15),az=baseZ+uz*(along-1.15),bx=baseX+ux*(along+1.15)+nx*.55*side,bz=baseZ+uz*(along+1.15)+nz*.55*side;
          const ldx=bx-ax,ldz=bz-az,ll=Math.hypot(ldx,ldz)||1,lux=ldx/ll,luz=ldz/ll,lnx=-luz,lnz=lux,hh=.055,yy=segmentYAt(seg,(t0+t1)/2)+.088;
          pushTri(yellow,[ax+lnx*hh,yy,az+lnz*hh],[ax-lnx*hh,yy,az-lnz*hh],[bx-lnx*hh,yy,bz-lnz*hh]);
          pushTri(yellow,[ax+lnx*hh,yy,az+lnz*hh],[bx-lnx*hh,yy,bz-lnz*hh],[bx+lnx*hh,yy,bz+lnz*hh]);
        }
        if(shelterItems.length<38&&pseudoRandom((p.id||i)*.019)>.28){
          shelterItems.push({x:sx+nx*side*1.2,z:sz+nz*side*1.2,y,yaw});
        }
      }
      quat.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
      pos.set(sx,y+1.175,sz);m.compose(pos,quat,scale);poles.setMatrixAt(i,m);
      pos.set(sx,y+2.15,sz);m.compose(pos,quat,scale);signs.setMatrixAt(i,m);
    }
    [poles,signs].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);});
    if(shelterItems.length){
      const roofGeo=new THREE.BoxGeometry(4.8,.18,1.7),glassGeo=new THREE.BoxGeometry(4.5,1.8,.07),benchGeo=new THREE.BoxGeometry(2.8,.16,.48);
      const roofs=new THREE.InstancedMesh(roofGeo,shared.busShelterRoof,shelterItems.length),backs=new THREE.InstancedMesh(glassGeo,shared.busShelterGlass,shelterItems.length),benches=new THREE.InstancedMesh(benchGeo,shared.busShelterRoof,shelterItems.length);
      shelterItems.forEach((it,i)=>{quat.setFromAxisAngle(new THREE.Vector3(0,1,0),it.yaw);
        pos.set(it.x,it.y+2.55,it.z);m.compose(pos,quat,scale);roofs.setMatrixAt(i,m);
        pos.set(it.x,it.y+1.55,it.z);m.compose(pos,quat,scale);backs.setMatrixAt(i,m);
        pos.set(it.x,it.y+.72,it.z+.2);m.compose(pos,quat,scale);benches.setMatrixAt(i,m);
      });
      [roofs,backs,benches].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;group.add(mesh);});
    }
    if(yellow.length){const mesh=meshFromFlatVertices(yellow,shared.markingYellow,false);mesh.renderOrder=6;group.add(mesh);}
    return count;
  }

  function addRoadsideTrees(group, segments, centerX, centerZ, buildings=[], terrainPatch=activeTerrainPatch) {
    const trees=[];
    const maxTrees=260;
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
        trees.push({x,z,y:terrainHeightAt(x,z,terrainPatch),scale});
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
      pos.set(t.x,(t.y||0)+1.55*t.scale,t.z);
      m.compose(pos,quat,scale);trunks.setMatrixAt(i,m);
      pos.set(t.x,(t.y||0)+(4.55+(.35*pseudoRandom(i+51)))*t.scale,t.z);
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
    if(material?.map)applyWorldUv(geometry,Number(material.userData?.uvScale)||.1);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = false;
    return mesh;
  }

  function buildingDescriptor(el, center, terrainPatch=activeTerrainPatch) {
    const pts=cleanPolygon(el.geometry.map(p=>project(p.lat,p.lon)));
    if(pts.length<3)return null;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    pts.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
    const area=Math.abs(polygonArea(pts));
    const w=maxX-minX,d=maxZ-minZ;
    if(area<8||area>45000||w>260||d>260)return null;
    const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
    const geo=unproject(x,z);if(!insideSingapore(geo.lat,geo.lon))return null;
    if(insideCustomLandmarkFootprint(x,z))return null;
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
    const groundY=terrainHeightAt(x,z,terrainPatch);
    h+=groundY;minHeight+=groundY;
    const wallTopWorld=wallTop+groundY;
    return {
      id:Number(el.id)||1,pts,x,z,w,d,h,wallTop:wallTopWorld,roofHeight,roofShape,minHeight,groundY,distance,area,isPart,kind,
      name:tags.name||'',
      blockNumber:buildingBlockNumber(tags),
      bounds:{minX,maxX,minZ,maxZ},
      bucket:buildingMaterialBucket(tags,el.id),
      visualClass:buildingVisualClass(tags,el.id)
    };
  }

  function buildingBlockNumber(tags={}) {
    const direct=String(tags['addr:housenumber']||'').trim().toUpperCase();
    if(/^[0-9]{1,3}[A-Z]?$/.test(direct))return direct;
    const name=String(tags.name||'');
    const hit=name.match(/(?:BLK|BLOCK)\s*([0-9]{1,3}[A-Z]?)/i);
    return hit?hit[1].toUpperCase():'';
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
    const r=pseudoRandom((Number(id)||1)*19);
    if(/glass/.test(material)||/glass/.test(facade)||(/office|commercial|hotel/.test(t)&&r>.42))return r>.72?6:4;
    if(/apartments|residential|dormitory|house|detached|terrace/.test(t))return r>.56?5:0;
    if(/office|commercial|retail|hotel/.test(t))return r>.60?7:1;
    if(/industrial|warehouse|garage/.test(t))return 2;
    if(/school|hospital|civic|public|government|university/.test(t))return 3;
    return [0,1,3,5,7][Math.abs(Number(id)||0)%5];
  }

  function buildingVisualClass(tags={},id=1) {
    const t=String(tags['building:part']||tags.building||'').toLowerCase();
    const name=String(tags.name||'').toLowerCase();
    const use=String(tags['building:use']||tags.office||tags.shop||'').toLowerCase();
    const material=String(tags['building:material']||tags.material||'').toLowerCase();
    if(/hdb|housing & development|block\s*\d+/.test(name)||/apartments|residential|dormitory/.test(t))return 'hdb';
    if(/retail|commercial|mall|supermarket|department_store/.test(t)||/retail|shop|mall/.test(use))return 'retail';
    if(/office|hotel/.test(t)||/office|hotel/.test(use)||/glass/.test(material))return 'office';
    if(/industrial|warehouse|garage/.test(t))return 'industrial';
    if(/school|hospital|civic|public|government|university|college/.test(t))return 'civic';
    if(/house|detached|terrace|semidetached_house/.test(t))return 'lowrise';
    return pseudoRandom((Number(id)||1)*41)>.72?'office':'generic';
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
    if (!type) return 'Toa Payoh road';
    return type.replace(/\b\w/g, c => c.toUpperCase());
  }
  function pseudoRandom(seed) { const x=Math.sin(Number(seed||1)*12.9898)*43758.5453; return x-Math.floor(x); }

  function addLandmarksTo(group, centerX, centerZ, terrainPatch=activeTerrainPatch) {
    for (const lm of LANDMARKS) {
      const p=project(lm.lat,lm.lon);
      if (Math.hypot(p.x-centerX,p.z-centerZ)>1750) continue;
      const holder=new THREE.Group();
      holder.position.y=terrainHeightAt(p.x,p.z,terrainPatch);
      group.add(holder);
      if (lm.kind==='hdbhub') addHdbHub(holder,p.x,p.z);
      else if (lm.kind==='dragon') addDragonPlayground(holder,p.x,p.z);
      else if (lm.kind==='townpark') addToaPayohTownPark(holder,p.x,p.z);
      else if (lm.kind==='vip53') addVipBlock53(holder,p.x,p.z);
      else if (lm.kind==='block157') addBlock157(holder,p.x,p.z);
      else if (lm.kind==='centralhorizon') addCentralHorizon(holder,p.x,p.z);
      else if (lm.kind==='toapayohmall') addToaPayohMall(holder,p.x,p.z);
      else if (lm.kind==='shuanglin') addShuangLinMonastery(holder,p.x,p.z);
      if(!holder.children.length)group.remove(holder);
    }
  }

  function addHdbHub(group,x,z){
    const hdb=new THREE.MeshStandardMaterial({color:0xc9c5b8,roughness:.82}),glass=new THREE.MeshStandardMaterial({color:0x66808c,roughness:.3,metalness:.1});
    const podium=new THREE.Mesh(new THREE.BoxGeometry(52,14,34),hdb);podium.position.set(x,7,z);group.add(podium);
    const tower=new THREE.Mesh(new THREE.BoxGeometry(22,76,24),hdb);tower.position.set(x-9,52,z);group.add(tower);
    for(let y=20;y<86;y+=9){const band=new THREE.Mesh(new THREE.BoxGeometry(22.3,.45,24.3),glass);band.position.set(x-9,y,z);group.add(band);}
    const hdbSign=makeLandmarkSign('HDB',{w:7.2,h:2.4,bg:'#f4f1e8',fg:'#4a7d9f',font:78});
    if(hdbSign){hdbSign.position.set(x+6,15.2,z-17.1);group.add(hdbSign);}
    const canopyMat=new THREE.MeshStandardMaterial({color:0xbec5c2,roughness:.48,metalness:.08});
    const canopy=new THREE.Mesh(new THREE.CylinderGeometry(17,17,2.0,24,1,false,0,Math.PI),canopyMat);canopy.rotation.z=Math.PI/2;canopy.rotation.y=Math.PI/2;canopy.scale.y=.45;canopy.position.set(x+10,5.2,z+21);group.add(canopy);
  }

  function addDragonPlayground(group,x,z){
    const red=new THREE.MeshStandardMaterial({color:0xb84a35,roughness:.72}),white=new THREE.MeshStandardMaterial({color:0xe3ded0,roughness:.8}),blue=new THREE.MeshStandardMaterial({color:0x2d78a7,roughness:.65}),green=new THREE.MeshStandardMaterial({color:0x4f9b78,roughness:.7}),sand=new THREE.MeshStandardMaterial({color:0xd8c49d,roughness:1});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(16,16,.18,28),sand);base.scale.z=.68;base.position.set(x,.09,z);group.add(base);
    const head=new THREE.Mesh(new THREE.BoxGeometry(7.5,8.5,2.4),red);head.position.set(x-7,4.3,z);head.rotation.z=-.12;group.add(head);
    const snout=new THREE.Mesh(new THREE.BoxGeometry(4.7,2.7,2.7),red);snout.position.set(x-10.2,3.0,z);group.add(snout);
    const eye=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.18,10),white);eye.rotation.x=Math.PI/2;eye.position.set(x-8.2,6.2,z-1.28);group.add(eye);
    const pupil=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.19,10),blue);pupil.rotation.x=Math.PI/2;pupil.position.set(x-8.2,6.2,z-1.39);group.add(pupil);
    for(let i=0;i<11;i++){
      const t=i/10,px=x-3+t*17,pz=z+Math.sin(t*Math.PI)*2.3,py=4.8+Math.sin(t*Math.PI)*1.1;
      const ring=new THREE.Mesh(new THREE.TorusGeometry(2.05,.16,6,18),i%3===0?red:(i%3===1?blue:green));ring.rotation.y=Math.PI/2;ring.position.set(px,py,pz);group.add(ring);
      if(i%2===0){const post=new THREE.Mesh(new THREE.BoxGeometry(.28,4,.28),white);post.position.set(px,2.2,pz);group.add(post);}
    }
    const slide=new THREE.Mesh(new THREE.BoxGeometry(2.2,.32,8.2),white);slide.position.set(x-5.7,2.4,z+5.2);slide.rotation.x=-.42;group.add(slide);
  }

  function addToaPayohTownPark(group,x,z){
    const water=new THREE.MeshStandardMaterial({color:0x638f95,roughness:.30,metalness:.02,transparent:true,opacity:.88}),
          pale=new THREE.MeshStandardMaterial({color:0xc9dce0,roughness:.62,metalness:.03}),
          paleDark=new THREE.MeshStandardMaterial({color:0x91adb5,roughness:.55}),
          green=new THREE.MeshStandardMaterial({color:0x5d815b,roughness:1}),
          stone=new THREE.MeshStandardMaterial({color:0x8f938f,roughness:.95}),
          glass=new THREE.MeshStandardMaterial({color:0x91b9c5,roughness:.18,metalness:.08,transparent:true,opacity:.44,side:THREE.DoubleSide});
    const pond=new THREE.Mesh(new THREE.CircleGeometry(22,36),water);pond.rotation.x=-Math.PI/2;pond.scale.y=.58;pond.position.set(x+10,.08,z+4);group.add(pond);
    const island=new THREE.Mesh(new THREE.CylinderGeometry(5.6,6,.3,18),green);island.position.set(x+12,.16,z+4);group.add(island);
    const path=new THREE.Mesh(new THREE.BoxGeometry(27,.16,2.4),stone);path.position.set(x-4,.12,z-4);path.rotation.y=-.25;group.add(path);
    const tx=x-10,tz=z-5;
    // The real 25 m lookout tower is a pale, open-frame tower with an octagonal observation head.
    const shaft=new THREE.Mesh(new THREE.BoxGeometry(3.1,20.5,3.1),pale);shaft.position.set(tx,10.25,tz);group.add(shaft);
    [[-2.15,-2.15],[2.15,-2.15],[-2.15,2.15],[2.15,2.15]].forEach(([dx,dz])=>{
      const col=new THREE.Mesh(new THREE.BoxGeometry(.42,20,.42),paleDark);col.position.set(tx+dx,10,tz+dz);group.add(col);
    });
    [5.0,10.2,15.4].forEach(y=>{
      const landing=new THREE.Mesh(new THREE.BoxGeometry(5.1,.34,5.1),pale);landing.position.set(tx,y,tz);group.add(landing);
      const rail=new THREE.Mesh(new THREE.TorusGeometry(3.05,.11,4,8),paleDark);rail.rotation.x=Math.PI/2;rail.rotation.z=Math.PI/8;rail.position.set(tx,y+.85,tz);group.add(rail);
    });
    const deck=new THREE.Mesh(new THREE.CylinderGeometry(4.5,4.1,1.25,8),pale);deck.position.set(tx,21.2,tz);group.add(deck);
    const cabin=new THREE.Mesh(new THREE.CylinderGeometry(4.2,4.2,3.0,8,1,true),glass);cabin.position.set(tx,23.05,tz);group.add(cabin);
    const canopy=new THREE.Mesh(new THREE.CylinderGeometry(4.75,4.3,.7,8),pale);canopy.position.set(tx,24.9,tz);group.add(canopy);
  }

  function addVipBlock53(group,x,z){
    const cream=new THREE.MeshStandardMaterial({color:0xd7d0bc,roughness:.83}),band=new THREE.MeshStandardMaterial({color:0xa96d52,roughness:.72}),roof=new THREE.MeshStandardMaterial({color:0x8a8c82,roughness:.78});
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3,wing=new THREE.Mesh(new THREE.BoxGeometry(11,57,28),cream);wing.position.set(x+Math.cos(a)*6.2,28.5,z+Math.sin(a)*6.2);wing.rotation.y=-a;group.add(wing);
      for(let y=7;y<56;y+=6){const b=new THREE.Mesh(new THREE.BoxGeometry(11.2,.42,28.2),band);b.position.set(wing.position.x,y,wing.position.z);b.rotation.y=wing.rotation.y;group.add(b);}
    }
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,8,12),roof);tank.position.set(x,63,z);group.add(tank);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(3.3,3.3,1.2,12),roof);cap.position.set(x,67.4,z);group.add(cap);
    const label=makeLandmarkSign('53',{w:4.5,h:2.2,bg:'#f2efe5',fg:'#944d3c',font:72});
    if(label){label.position.set(x,11,z-15.0);group.add(label);}
  }

  function addBlock157(group,x,z){
    const cream=new THREE.MeshStandardMaterial({color:0xd5cdb8,roughness:.84}),accent=new THREE.MeshStandardMaterial({color:0x8ca5a0,roughness:.72});
    for(let i=0;i<13;i++){
      const a=-1.12+i*(2.24/12),r=31,px=x+Math.sin(a)*r,pz=z+Math.cos(a)*r;
      const b=new THREE.Mesh(new THREE.BoxGeometry(8.5,31,8.5),cream);b.position.set(px,15.5,pz);b.rotation.y=a;group.add(b);
      if(i%2===0){const stripe=new THREE.Mesh(new THREE.BoxGeometry(8.8,1.0,8.8),accent);stripe.position.set(px,19,pz);stripe.rotation.y=a;group.add(stripe);}
    }
    const label=makeLandmarkSign('157',{w:5.6,h:2.0,bg:'#e9e3d4',fg:'#5c7f7a',font:68});
    if(label){label.position.set(x,9.2,z-31.2);group.add(label);}
  }

  function addCentralHorizon(group,x,z){
    const cream=new THREE.MeshStandardMaterial({color:0xd4d0c3,roughness:.8}),glass=new THREE.MeshStandardMaterial({color:0x78939d,roughness:.32,metalness:.05}),gold=new THREE.MeshStandardMaterial({color:0xc5a65f,roughness:.5,metalness:.12});
    [-28,-14,0,14,28].forEach((dx,i)=>{
      const h=79+(i%2)*5,t=new THREE.Mesh(new THREE.BoxGeometry(10.5,h,16),cream);t.position.set(x+dx,h/2,z+(i%2?3:-2));group.add(t);
      const core=new THREE.Mesh(new THREE.BoxGeometry(3.0,h-6,16.3),glass);core.position.set(x+dx+3.8,(h-6)/2+2.5,z+(i%2?3:-2));group.add(core);
      const crown=new THREE.Mesh(new THREE.BoxGeometry(12.5,4.0,18),gold);crown.position.set(x+dx,h+2,z+(i%2?3:-2));group.add(crown);
    });
  }

  function makeLandmarkSign(text,{w=8,h=2,bg='#f2c500',fg='#222',font=54}={}){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);
    ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`800 ${font}px -apple-system,BlinkMacSystemFont,Arial,sans-serif`;
    ctx.fillText(String(text||'').slice(0,28),256,66,470);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
    const mat=new THREE.MeshBasicMaterial({map:tex,toneMapped:false,transparent:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.userData.ephemeralTexture=tex;return mesh;
  }

  function addToaPayohMall(group,x,z){
    const white=new THREE.MeshStandardMaterial({color:0xd9d9d2,roughness:.82}),
          blue=new THREE.MeshStandardMaterial({color:0x547f93,roughness:.70}),
          tile=new THREE.MeshStandardMaterial({color:0xb9aaa0,roughness:.94}),
          awning=new THREE.MeshStandardMaterial({color:0xa94e32,roughness:.84}),
          yellow=new THREE.MeshStandardMaterial({color:0xf0c81f,roughness:.58}),
          dark=new THREE.MeshStandardMaterial({color:0x31383a,roughness:.8});
    // Long, low-rise pedestrian mall: the familiar heartland contrast against surrounding towers.
    const plaza=new THREE.Mesh(new THREE.BoxGeometry(38,.18,11),tile);plaza.position.set(x,.10,z);group.add(plaza);
    [-8.7,8.7].forEach(dz=>{
      const block=new THREE.Mesh(new THREE.BoxGeometry(38,8.4,6.3),white);block.position.set(x,4.2,z+dz);group.add(block);
      const upper=new THREE.Mesh(new THREE.BoxGeometry(38.2,3.0,6.45),blue);upper.position.set(x,6.7,z+dz);group.add(upper);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(38.5,.55,7.4),awning);roof.position.set(x,8.7,z+dz);group.add(roof);
      for(let i=-4;i<=4;i++){
        const shop=new THREE.Mesh(new THREE.BoxGeometry(3.1,2.6,.16),dark);shop.position.set(x+i*4.0,2.1,z+dz+(dz<0?3.24:-3.24));group.add(shop);
      }
    });
    // Yellow Toa Payoh Mall gateway seen at the pedestrian entrance.
    const gx=x-16,gz=z;
    [-5.1,5.1].forEach(dz=>{const post=new THREE.Mesh(new THREE.BoxGeometry(1.0,7.2,1.0),yellow);post.position.set(gx,3.6,gz+dz);group.add(post);});
    const beam=new THREE.Mesh(new THREE.BoxGeometry(1.0,1.05,11.1),yellow);beam.position.set(gx,6.9,gz);group.add(beam);
    const sign=makeLandmarkSign('TOA PAYOH MALL',{w:8.8,h:1.65,bg:'#f0c81f',fg:'#344046',font:46});
    if(sign){sign.position.set(gx-.53,6.65,gz);sign.rotation.y=Math.PI/2;group.add(sign);}
    // small clock disc at the gateway
    const clockFace=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.0,.16,24),new THREE.MeshStandardMaterial({color:0xf4efe2,roughness:.7}));
    clockFace.rotation.z=Math.PI/2;clockFace.position.set(gx-.62,8.15,gz);group.add(clockFace);
  }

  function addShuangLinMonastery(group,x,z){
    const wall=new THREE.MeshStandardMaterial({color:0xd9c7a2,roughness:.9}),
          red=new THREE.MeshStandardMaterial({color:0x8d3628,roughness:.8}),
          roof=new THREE.MeshStandardMaterial({color:0x5d6660,roughness:.78}),
          gold=new THREE.MeshStandardMaterial({color:0xc9a74c,roughness:.42,metalness:.16}),
          stone=new THREE.MeshStandardMaterial({color:0xa7a192,roughness:.92});
    const courtyard=new THREE.Mesh(new THREE.BoxGeometry(52,.16,38),stone);courtyard.position.set(x,.09,z);group.add(courtyard);
    const hall=new THREE.Mesh(new THREE.BoxGeometry(30,7.8,17),wall);hall.position.set(x-7,3.9,z+6);group.add(hall);
    const hallRoof=new THREE.Mesh(new THREE.ConeGeometry(18,5.5,4),roof);hallRoof.rotation.y=Math.PI/4;hallRoof.scale.z=.62;hallRoof.position.set(x-7,10.2,z+6);group.add(hallRoof);
    const gate=new THREE.Mesh(new THREE.BoxGeometry(20,5.6,4.5),wall);gate.position.set(x-7,2.8,z-13);group.add(gate);
    const gateRoof=new THREE.Mesh(new THREE.ConeGeometry(12,4.0,4),red);gateRoof.rotation.y=Math.PI/4;gateRoof.scale.z=.48;gateRoof.position.set(x-7,6.4,z-13);group.add(gateRoof);
    // Seven-storey tapering pagoda, the strongest silhouette from the road.
    const px=x+17,pz=z+3;
    for(let i=0;i<7;i++){
      const y=i*3.25+1.4,scale=1-i*.075;
      const level=new THREE.Mesh(new THREE.CylinderGeometry(2.6*scale,2.9*scale,2.5,8),wall);level.position.set(px,y,pz);group.add(level);
      const eave=new THREE.Mesh(new THREE.CylinderGeometry(4.0*scale,2.8*scale,.55,8),roof);eave.position.set(px,y+1.5,pz);group.add(eave);
    }
    const finial=new THREE.Mesh(new THREE.ConeGeometry(.75,3.3,8),gold);finial.position.set(px,25.5,pz);group.add(finial);
  }

  function buildEmergencyWorld() {
    const group=new THREE.Group(),segments=[],roadVerts=[],lineVerts=[];
    const roads=[
      [[-420,0],[420,0]],
      [[0,-330],[0,330]],
      [[-360,-220],[-180,-80],[0,0],[180,90],[360,230]],
      [[-360,220],[-180,90],[0,0],[190,-95],[360,-220]]
    ];
    roads.forEach((line,idx)=>{
      const points=line.map(([x,z])=>({x,z}));
      for(let i=0;i<points.length-1;i++){
        const seg={ax:points[i].x,az:points[i].z,bx:points[i+1].x,bz:points[i+1].z,width:9,major:true,lanes:2,type:'primary',oneway:'',name:'DriveSG offline road',speedLimit:50};
        segments.push(seg);appendRoadQuad(roadVerts,seg,.025);appendCenterDashes(lineVerts,seg);
      }
    });
    const roadMesh=meshFromFlatVertices(roadVerts,shared.road,true);if(roadMesh)group.add(roadMesh);
    const lineMesh=meshFromFlatVertices(lineVerts,shared.line,false);if(lineMesh)group.add(lineMesh);
    return {group,segments,roadCount:roads.length,buildingCount:0,buildingColliders:[],waterPolygons:[],parkPolygons:[],treeCount:0,roadGraph:buildRoadGraph(segments),signalDescriptors:[],busStopDescriptors:[],trafficSignalCount:0};
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
        const seg={ax:points[i].x,az:points[i].z,bx:points[i+1].x,bz:points[i+1].z,width:idx<4?9.5:7,major:idx<4,lanes:2,type:idx<4?'primary':'residential',oneway:'',name:'Local road',speedLimit:50};
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
    applyGraphicsTier(graphicsTier,{quiet:true});
    roadSegments=built.segments;
    roadGraph=built.roadGraph||buildRoadGraph(roadSegments);
    trafficSignalsWorld=built.signalDescriptors||[];
    busStopsWorld=built.busStopDescriptors||[];
    trafficSignalVisuals=built.signalVisuals||null;
    lastSignalVisualUpdate=-Infinity;
    userSignalTracker={key:'',distance:Infinity,violatedAt:-Infinity};
    buildingColliders=built.buildingColliders||[];
    currentWaterPolygons=built.waterPolygons||[];
    currentParkPolygons=built.parkPolygons||[];
    activeTerrainPatch=built.terrainPatch||null;
    rebuildRoadIndex();
    rebuildBuildingIndex();
    ambientTraffic=[]; // Toa Payoh focus build: no ambient public traffic
    if(navigation.active&&navigation.mode==='route')try{renderNavigationWorld();}catch(err){console.warn('Route redraw skipped',err?.message||err);}
    if(previous){scene.remove(previous);try{disposeWorldGroup(previous);}catch(err){console.warn('Previous world cleanup skipped',err?.message||err);}}
    console.info(`DriveSG world: ${built.roadCount} road ways, ${built.buildingCount} buildings, ${built.trafficSignalCount||0} signals, ${built.streetLightCount||0} lights, ${built.roadSignCount||0} road signs, ${(built.treeCount||0)+(built.tropicalPlantCount||0)} plants, ${built.segments.length} segments`);
  }

  function disposeWorldGroup(group) {
    const retained = new Set([shared.terrain,shared.sidewalk,shared.roadEdge,shared.road,shared.majorRoad,shared.line,shared.markingYellow,shared.median,shared.bridge,shared.tunnel,shared.tunnelLight,shared.roadStud,shared.water,shared.park,shared.windows,shared.storefront,shared.hdbCorridor,shared.officeBand,shared.awning,shared.rooftop,shared.curb,shared.islandKerb,shared.treeTrunk,shared.treeLeaf,shared.treeLeafLight,shared.palmLeaf,shared.signalPole,shared.signalHead,shared.signalRed,shared.signalAmber,shared.signalGreen,shared.busStopPole,shared.busStopSign,shared.busShelterRoof,shared.busShelterGlass,shared.streetPole,shared.streetLamp,shared.gantryPole,shared.gantrySign,trafficMaterial,...shared.buildings]);
    group.traverse(obj=>{
      if(obj.geometry) obj.geometry.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(mat=>{ if(!retained.has(mat)){ mat.map?.dispose?.(); mat.dispose?.(); } });
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
    reverseEngaged=false;
    driveGear=1;engineRpm=ENGINE_IDLE_RPM;shiftTimer=0;engineLoad=0;
    carRoadY=segmentYAt(seg,best.t);
    resetDrivingDynamics();
    car.position.set(px,.07+carRoadY,pz);
    car.rotation.set(0,yaw,0);
    steeringVisual=0;
    input.steer=0;
    updateSteerKnob(0);
    if(!silent)showToast('Car reset to the nearest road');
  }

  function resetCar() { placeCarNear(car.position.x,car.position.z,false); }

  function updateTransmission(dt,gas,brake,elapsed){
    const kmh=Math.abs(speedMps)*3.6;
    if(reverseEngaged||speedMps<-.14){driveGear=1;shiftTimer=0;engineLoad=brake;const target=ENGINE_IDLE_RPM+Math.min(kmh,32)*82+brake*260;engineRpm+=(target-engineRpm)*Math.min(1,dt*7.5);return;}
    if(shiftTimer>0)shiftTimer=Math.max(0,shiftTimer-dt);
    if(shiftTimer<=0){
      const up=TRANSMISSION_UP_KMH[driveGear]??999,down=TRANSMISSION_DOWN_KMH[driveGear]??0;
      const upPoint=up+gas*(driveGear<4?7:10);
      if(driveGear<TRANSMISSION_GEARS&&kmh>upPoint&&gas>.08){driveGear++;shiftTimer=SHIFT_DURATION_SECONDS;lastShiftAt=elapsed;engineRpm*=.72;playGearShiftSound();}
      else if(driveGear>1&&kmh<down&&(gas<.55||engineRpm<1500)){driveGear--;shiftTimer=SHIFT_DURATION_SECONDS*.72;lastShiftAt=elapsed;engineRpm*=1.18;playGearShiftSound();}
    }
    const slope=TRANSMISSION_RPM_PER_KMH[Math.max(0,driveGear-1)]||35;
    let target=ENGINE_IDLE_RPM+kmh*slope+gas*280;
    if(shiftTimer>0)target=Math.min(target,engineRpm*.90);
    target=THREE.MathUtils.clamp(target,ENGINE_IDLE_RPM,ENGINE_REDLINE_RPM);
    engineRpm+=(target-engineRpm)*Math.min(1,dt*(shiftTimer>0?9.5:6.6));
    engineLoad=THREE.MathUtils.clamp(gas*(shiftTimer>0?.35:1)+Math.max(0,(engineRpm-4800)/2400)*.12,0,1);
  }

  function updateCar(dt,elapsed) {
    const panelOpen=els.placesPanel.classList.contains('open');
    const challengeLocked=challenge.active&&challenge.phase==='countdown';
    const controlsLocked=panelOpen||challengeLocked||document.body.classList.contains('challenge-result-open');
    const gas=controlsLocked?0:input.gas,brake=controlsLocked?0:input.brake,steer=controlsLocked?0:input.steer;

    const absSpeed=Math.abs(speedMps);
    const roadGrip=onRoad?THREE.MathUtils.lerp(1,.68,wetness):.43;
    const steerLoad=Math.abs(steer)*Math.min(absSpeed/25,1);
    const tractionDemand=gas*(.58+steerLoad*.62)*(wetness+.22);
    tcsActive=Boolean(onRoad&&absSpeed>5&&tractionDemand>.48);

    const accel=7.15*(1-wetness*.055)*(tcsActive?THREE.MathUtils.lerp(.84,.61,wetness):1)*(shiftTimer>0?.48:1);
    const baseBrake=15.9*(onRoad?1:.58)*THREE.MathUtils.lerp(1,.77,wetness);
    absActive=Boolean(brake>.72&&absSpeed>7&&(wetness>.16||!onRoad));
    const brakeForce=baseBrake*(absActive?(.93+.035*Math.sin(elapsed*76)):1);
    const reverseAccel=4.8;
    const reverseHoldSeconds=.30;

    // One-pedal brake-to-reverse behaviour for touch controls:
    // BRAKE slows the car first. Keep holding once stationary to deliberately engage R,
    // then the same pedal becomes reverse throttle until released.
    if(gas>0){
      reverseHold=0;
      reverseEngaged=false;
      if(speedMps<-0.45)speedMps+=brakeForce*dt;
      else speedMps+=accel*gas*dt;
    }

    if(brake>0){
      if(speedMps>0.45){
        reverseHold=0;
        reverseEngaged=false;
        speedMps-=brakeForce*brake*dt;
      }else{
        if(!reverseEngaged && speedMps>-.14){
          speedMps=0;
          reverseHold+=dt;
          if(reverseHold>=reverseHoldSeconds)reverseEngaged=true;
        }
        if(reverseEngaged || speedMps<=-.14){
          reverseEngaged=true;
          speedMps-=reverseAccel*brake*dt;
        }
      }
    }else if(!gas){
      reverseHold=0;
      if(speedMps>-.08)reverseEngaged=false;
    }

    const brakeLabel=els.brakeBtn?.querySelector('span');
    if(brakeLabel){
      if(reverseEngaged || speedMps<-.14){
        brakeLabel.textContent='REVERSE';
        els.brakeBtn.classList.add('reverse-ready');
      }else if(brake>0 && speedMps<=.45){
        brakeLabel.textContent='HOLD R';
        els.brakeBtn.classList.remove('reverse-ready');
      }else{
        brakeLabel.textContent='BRAKE';
        els.brakeBtn.classList.remove('reverse-ready');
      }
    }

    if(!gas&&!brake){
      const drag=(onRoad?.80:3.15)*dt;
      if(Math.abs(speedMps)<=drag)speedMps=0;else speedMps-=Math.sign(speedMps)*drag;
    }

    const maxForward=onRoad?35.4:12.4;
    speedMps=THREE.MathUtils.clamp(speedMps,-8.8,maxForward);
    const newAbsSpeed=Math.abs(speedMps);

    // Speed-sensitive bicycle steering, now with yaw inertia and load-sensitive understeer.
    const steerLimit=THREE.MathUtils.lerp(.47,.165,Math.min(newAbsSpeed/34,1));
    const wheelbase=2.68;
    const understeer=1/(1+Math.pow(newAbsSpeed/28,2)*Math.abs(steer)*.72);
    const gripYaw=THREE.MathUtils.lerp(.58,1,roadGrip)*understeer;
    let targetYawVelocity=0;
    if(newAbsSpeed>.10){
      const rawYawRate=(speedMps/wheelbase)*Math.tan(steer*steerLimit);
      // Negative world yaw is a right turn in DriveSG's +Z-forward coordinate system.
      targetYawVelocity=-THREE.MathUtils.clamp(rawYawRate,-1.72,1.72)*gripYaw;
    }
    const yawResponse=THREE.MathUtils.lerp(4.4,8.2,roadGrip);
    yawVelocity+=(targetYawVelocity-yawVelocity)*Math.min(1,dt*yawResponse);
    car.rotation.y+=yawVelocity*dt;

    // Lateral velocity makes fast direction changes feel like tyres rather than a rotating camera rig.
    // Low grip creates a small outward slip which is then scrubbed away by tyre cornering force.
    const slipGeneration=Math.max(0,newAbsSpeed-6)*Math.abs(steer)*(.035+wetness*.075+(onRoad?0:.13));
    if(newAbsSpeed>3)lateralSlipMps+=(-Math.sign(steer||yawVelocity||1))*slipGeneration*dt;
    const lateralGripRate=THREE.MathUtils.lerp(2.45,7.8,roadGrip)/(1+newAbsSpeed*.012);
    lateralSlipMps*=Math.exp(-lateralGripRate*dt);
    lateralSlipMps=THREE.MathUtils.clamp(lateralSlipMps,-4.8,4.8);
    tyreSlip=THREE.MathUtils.clamp(Math.abs(lateralSlipMps)/Math.max(newAbsSpeed,3)*2.1+Math.abs(targetYawVelocity-yawVelocity)*.34,0,1.4);

    steeringVisual+=(steer-steeringVisual)*Math.min(1,dt*11);
    const longitudinalAccel=(speedMps-lastPhysicsSpeedMps)/Math.max(dt,.008);
    lastPhysicsSpeedMps=speedMps;
    const pitchTarget=THREE.MathUtils.clamp(-longitudinalAccel*.0055,-.055,.07);
    longitudinalVisual+=(pitchTarget-longitudinalVisual)*Math.min(1,dt*7.5);

    // A tiny sprung-mass model combines road elevation transitions and surface roughness.
    const roughAmplitude=(onRoad?.0045:.030)*Math.min(newAbsSpeed/18,1);
    const roughWave=(Math.sin(elapsed*(onRoad?19:13)+car.position.x*.07)+Math.sin(elapsed*(onRoad?27:18)+car.position.z*.05)*.55)*roughAmplitude;
    const springTarget=roughWave+roadShock*.045;
    const springForce=(springTarget-suspensionHeave)*42-suspensionHeaveVel*9.2;
    suspensionHeaveVel+=springForce*dt;suspensionHeave+=suspensionHeaveVel*dt;
    roadShock*=Math.exp(-8.5*dt);

    if(carBody){
      const lateralG=THREE.MathUtils.clamp(yawVelocity*speedMps/9.81,-1.35,1.35);
      carBody.rotation.z=THREE.MathUtils.clamp(lateralG*.040,-.065,.065)-steeringVisual*.009;
      carBody.rotation.x=longitudinalVisual;
      carBody.position.y=.75+suspensionHeave;
    }
    frontWheels.forEach(p=>p.rotation.y=-steeringVisual*.36);
    const wheelSpin=speedMps*dt/.35;
    allWheels.forEach(w=>w.rotation.x+=wheelSpin);
    if(tailLightMaterial) tailLightMaterial.emissiveIntensity=brake>0?3.0:.65;

    const beforeX=car.position.x,beforeZ=car.position.z;
    const fx=Math.sin(car.rotation.y),fz=Math.cos(car.rotation.y),rightX=fz,rightZ=-fx;
    car.position.x+=(fx*speedMps+rightX*lateralSlipMps)*dt;
    car.position.z+=(fz*speedMps+rightZ*lateralSlipMps)*dt;

    const collision=carHitsBuilding(car.position.x,car.position.z,carRoadY)||carHitsTraffic(car.position.x,car.position.z,carRoadY)||carHitsWater(car.position.x,car.position.z,carRoadY);
    if(collision){
      car.position.x=beforeX;car.position.z=beforeZ;
      const impact=Math.min(1,newAbsSpeed/18);
      speedMps*=-THREE.MathUtils.lerp(.04,.15,impact);
      lateralSlipMps*=-.28;
      yawVelocity+=THREE.MathUtils.clamp(steer*.22,-.18,.18);
      cameraShake=Math.max(cameraShake,.30+impact*.58);
      roadShock=Math.max(roadShock,.65);
      playCollisionThump();
      recordChallengeCollision(elapsed);
    }

    const elevationHit=nearestRoadHit(car.position.x,car.position.z,false);
    inTunnel=Boolean(elevationHit&&elevationHit.seg?.tunnel&&elevationHit.dist<elevationHit.seg.width/2+3.5);
    document.body.classList.toggle('in-tunnel',inTunnel);
    updateUserTrafficRuleState(elapsed,elevationHit);
    const elevationTarget=elevationHit&&elevationHit.dist<elevationHit.seg.width/2+4?segmentYAt(elevationHit.seg,elevationHit.t):terrainHeightAt(car.position.x,car.position.z,activeTerrainPatch);
    const elevationStep=Math.abs(elevationTarget-lastElevationTarget);
    if(elevationStep>.035&&newAbsSpeed>4)roadShock=Math.max(roadShock,THREE.MathUtils.clamp(elevationStep*.9,0,.65));
    lastElevationTarget=elevationTarget;
    carRoadY+=(elevationTarget-carRoadY)*Math.min(1,dt*(elevationTarget>carRoadY?2.4:1.55));
    car.position.y=.07+carRoadY+suspensionHeave*.18;

    const coords=unproject(car.position.x,car.position.z);
    if(!insideSingapore(coords.lat,coords.lon)){
      car.position.x=beforeX;car.position.z=beforeZ;speedMps*=.15;lateralSlipMps=0;yawVelocity=0;
      showToast('Toa Payoh boundary');
    }else if(!panelOpen){
      const moved=Math.hypot(car.position.x-beforeX,car.position.z-beforeZ);
      if(moved<5) sessionDistanceM+=moved;
    }

    if(elapsed-lastOnRoadCheck>.18){
      lastOnRoadCheck=elapsed;
      const hit=nearestRoadHit(car.position.x,car.position.z,false);
      const edgeDist=hit?Math.max(0,hit.dist-hit.seg.width/2):Infinity;
      onRoad=edgeDist<3.0;
      els.surfaceState.textContent=inTunnel?'TUNNEL':(onRoad?'ON ROAD':'OFF ROAD');
      els.surfaceState.classList.toggle('offroad',!onRoad);
      const label=hit?.seg?.name || (onRoad?'Toa Payoh road':'Off road');
      if(label!==lastRoadLabel){lastRoadLabel=label;if(els.roadName)els.roadName.textContent=label;}
      const limit=onRoad?(hit?.seg?.speedLimit||null):null;
      if(limit!==lastSpeedLimit){
        lastSpeedLimit=limit;
        if(els.speedLimit){els.speedLimit.classList.toggle('hidden',!limit);if(limit)els.speedLimit.textContent=String(limit);}
      }
    }

    updateTransmission(dt,gas,brake,elapsed);
    const speedKmh=Math.round(newAbsSpeed*3.6);
    sessionTopSpeedKmh=Math.max(sessionTopSpeedKmh,speedKmh);
    els.speed.textContent=speedKmh;
    els.gear.textContent=(reverseEngaged||speedMps<-.14)?'R':String(driveGear);
    document.querySelector('.drive-hud')?.classList.toggle('speeding',Boolean(lastSpeedLimit&&speedKmh>lastSpeedLimit+5));
    if(els.tripDistance)els.tripDistance.textContent=formatTripDistance(sessionDistanceM);
    if(els.topSpeed)els.topSpeed.textContent=String(sessionTopSpeedKmh);
    updateDynamicsHud();
  }

  function updateCamera(dt,elapsed) {
    if(!cameraLookActive){
      cameraLookYaw*=Math.exp(-2.8*dt);
      cameraLookPitch*=Math.exp(-3.4*dt);
      if(Math.abs(cameraLookYaw)<.002)cameraLookYaw=0;
      if(Math.abs(cameraLookPitch)<.002)cameraLookPitch=0;
    }
    const fx=Math.sin(car.rotation.y),fz=Math.cos(car.rotation.y),sideX=fz,sideZ=-fx;
    const viewYaw=car.rotation.y+cameraLookYaw,viewFx=Math.sin(viewYaw),viewFz=Math.cos(viewYaw),viewSideX=viewFz,viewSideZ=-viewFx;
    const speedRatio=Math.min(Math.abs(speedMps)/35,1);
    const anticipation=steeringVisual*THREE.MathUtils.lerp(.22,1.2,speedRatio);
    const shakeDecay=Math.exp(-5.4*dt);cameraShake*=shakeDecay;
    const roadShake=(onRoad?.010:.055)*speedRatio+(wetness*.006*speedRatio);
    const shakeX=(Math.sin(elapsed*37.1)+Math.sin(elapsed*61.7)*.38)*roadShake+Math.sin(elapsed*53)*cameraShake*.055;
    const shakeY=(Math.sin(elapsed*41.3+.7)+Math.sin(elapsed*73.2)*.24)*roadShake+Math.cos(elapsed*47)*cameraShake*.075;

    let desired,target,desiredFov;
    if(cameraMode==='hood'){
      desired=new THREE.Vector3(
        car.position.x+fx*1.18+sideX*shakeX*.18,
        car.position.y+1.48+shakeY*.22,
        car.position.z+fz*1.18+sideZ*shakeX*.18
      );
      target=new THREE.Vector3(
        car.position.x+viewFx*THREE.MathUtils.lerp(18,28,speedRatio)-viewSideX*anticipation*.25,
        car.position.y+1.12+cameraLookPitch*9+shakeY*.08,
        car.position.z+viewFz*THREE.MathUtils.lerp(18,28,speedRatio)-viewSideZ*anticipation*.25
      );
      desiredFov=64+speedRatio*4.5;
    }else if(cameraMode==='scenic'){
      const back=THREE.MathUtils.lerp(17.5,20.5,speedRatio),height=THREE.MathUtils.lerp(9.2,10.8,speedRatio);
      desired=new THREE.Vector3(
        car.position.x-viewFx*back+viewSideX*(3.2+anticipation*.4+shakeX),
        car.position.y+height+cameraLookPitch*3.5+shakeY*.7,
        car.position.z-viewFz*back+viewSideZ*(3.2+anticipation*.4+shakeX)
      );
      target=new THREE.Vector3(
        car.position.x+fx*THREE.MathUtils.lerp(5.5,9.0,speedRatio),
        car.position.y+1.25+cameraLookPitch*4,
        car.position.z+fz*THREE.MathUtils.lerp(5.5,9.0,speedRatio)
      );
      desiredFov=56+speedRatio*4.0;
    }else{
      const back=THREE.MathUtils.lerp(12.2,15.0,speedRatio),height=THREE.MathUtils.lerp(5.9,6.8,speedRatio),lookAhead=THREE.MathUtils.lerp(4.7,8.0,speedRatio);
      desired=new THREE.Vector3(
        car.position.x-viewFx*back+viewSideX*(anticipation+shakeX),
        car.position.y+height+cameraLookPitch*2.5+shakeY,
        car.position.z-viewFz*back+viewSideZ*(anticipation+shakeX)
      );
      target=new THREE.Vector3(
        car.position.x+fx*lookAhead-sideX*anticipation*.35,
        car.position.y+1.62+cameraLookPitch*5+shakeY*.15,
        car.position.z+fz*lookAhead-sideZ*anticipation*.35
      );
      desiredFov=59+speedRatio*5.5;
    }

    const alpha=1-Math.pow(cameraMode==='hood'?.0012:(cameraMode==='scenic'?.0042:.0028),dt);
    camera.position.lerp(desired,alpha);camera.lookAt(target);
    const cameraRoll=THREE.MathUtils.clamp(-yawVelocity*speedRatio*.022,-.030,.030)+shakeX*.018;
    camera.rotateZ(cameraRoll);
    if(Math.abs(camera.fov-desiredFov)>.02){camera.fov+=(desiredFov-camera.fov)*Math.min(1,dt*3.8);camera.updateProjectionMatrix();}

    const sunProgress=THREE.MathUtils.clamp((lightingSunHour-6)/13,0,1),sunAngle=sunProgress*Math.PI,azimuth=(lightingSunHour/24)*Math.PI*2+.7;
    const sunHeight=Math.max(28,Math.sin(sunAngle)*190),sunRadius=155;
    sun.position.set(car.position.x+Math.cos(azimuth)*sunRadius,sunHeight,car.position.z+Math.sin(azimuth)*sunRadius);
    sunTarget.position.set(car.position.x,0,car.position.z);
    if(sunDisc)sunDisc.position.set(car.position.x+Math.cos(azimuth)*720,THREE.MathUtils.clamp(sunHeight*2.25,65,420),car.position.z+Math.sin(azimuth)*720);
    if(moonDisc){const maz=azimuth+Math.PI;moonDisc.position.set(car.position.x+Math.cos(maz)*760,260,car.position.z+Math.sin(maz)*760);}
    if(skyDome){skyDome.position.x=car.position.x;skyDome.position.z=car.position.z;}
    if(horizonHaze){horizonHaze.position.x=car.position.x;horizonHaze.position.z=car.position.z;}
  }

  function maybeStreamWorld(_elapsed) {
    // Toa Payoh focus: keep one stable world in memory instead of rebuilding scenery while driving.
  }

  async function streamAroundCar(_coords,_centerX,_centerZ) {
    return false;
  }

  function maybePrefetchRouteAhead(_elapsed){
    // No long-distance route prefetch in the town-only build.
  }

  function initialiseGraphicsTier(){
    const px=Math.max(screen?.width||0,screen?.height||0)*Math.min(window.devicePixelRatio||1,2);
    const lowEnd=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);
    graphicsTier=lowEnd?'balanced':'high';
    applyGraphicsTier(graphicsTier,{quiet:true});
  }

  function graphicsTierRank(tier){return tier==='performance'?0:(tier==='balanced'?1:2);}

  function applyGraphicsTier(tier,{quiet=false}={}){
    if(!['high','balanced','performance'].includes(tier))return;
    const changed=tier!==graphicsTier;
    graphicsTier=tier;
    document.documentElement.dataset.graphicsTier=tier;
    if(renderer){
      const shadowOn=tier!=='performance';
      renderer.shadowMap.enabled=shadowOn;
      if(sun)sun.castShadow=shadowOn;
    }
    if(rainPoints?.geometry){
      const count=tier==='high'?RAIN_PARTICLES_HIGH:(tier==='balanced'?RAIN_PARTICLES_BALANCED:RAIN_PARTICLES_PERFORMANCE);
      rainPoints.geometry.setDrawRange(0,count);
    }
    if(dynamicWorld){
      dynamicWorld.traverse(obj=>{
        const layer=obj.userData?.qualityLayer;
        if(layer==='micro')obj.visible=tier!=='performance';
        else if(layer==='detail')obj.visible=true;
      });
    }
    if(changed&&!quiet)showToast(`Graphics · ${tier==='performance'?'performance':tier}`);
  }

  function updatePresentationFx(dt){
    if(!els.speedVignette||!car)return;
    const speedRatio=THREE.MathUtils.clamp(Math.abs(speedMps)/35,0,1);
    const vignette=THREE.MathUtils.clamp((speedRatio-.28)*.24+cameraShake*.16,0,.20);
    els.speedVignette.style.opacity=String(vignette);
    els.speedVignette.style.transform=`scale(${(1.05+speedRatio*.018).toFixed(3)})`;
    if(els.rainGlass){
      const rain=environmentState.condition==='heavy-rain'?1:(environmentState.condition==='rain'?.58:0);
      els.rainGlass.style.opacity=String(THREE.MathUtils.clamp(rain*.22+wetness*.09,0,.28));
    }
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
    updateChallenge(dt,elapsed);
    updateNavigation(elapsed);
    updateDiscoveryExperience(elapsed);
    updateCamera(dt,elapsed);
    updatePresentationFx(dt);
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
    fpsSmoothed=fpsSmoothed*.68+fps*.32;
    const minRatio=graphicsTier==='performance'?.72:.80;
    const maxRatio=basePixelRatio;
    let next=qualityPixelRatio;

    if(fpsSmoothed<PERFORMANCE_TARGET_FPS-7&&qualityPixelRatio>minRatio)next=Math.max(minRatio,qualityPixelRatio-.10);
    else if(fpsSmoothed>PERFORMANCE_TARGET_FPS+7&&qualityPixelRatio<maxRatio&&graphicsTier!=='performance')next=Math.min(maxRatio,qualityPixelRatio+.06);

    if(Math.abs(next-qualityPixelRatio)>.02){
      qualityPixelRatio=next;
      renderer.setPixelRatio(qualityPixelRatio);
      renderer.setSize(viewportWidth(),viewportHeight(),false);
    }

    if(fpsSmoothed<PERFORMANCE_TARGET_FPS-11){qualityLowWindows++;qualityHighWindows=0;}
    else if(fpsSmoothed>PERFORMANCE_TARGET_FPS+5){qualityHighWindows++;qualityLowWindows=Math.max(0,qualityLowWindows-1);}
    else {qualityLowWindows=Math.max(0,qualityLowWindows-1);qualityHighWindows=Math.max(0,qualityHighWindows-1);}

    const elapsed=clock?.elapsedTime||0;
    if(elapsed-lastGraphicsTierChange>GRAPHICS_TIER_COOLDOWN){
      if(qualityLowWindows>=2&&graphicsTier!=='performance'){
        const nextTier=graphicsTier==='high'?'balanced':'performance';
        applyGraphicsTier(nextTier);
        lastGraphicsTierChange=elapsed;qualityLowWindows=0;qualityHighWindows=0;
      }else if(qualityHighWindows>=4&&graphicsTier!=='high'){
        const nextTier=graphicsTier==='performance'?'balanced':'high';
        applyGraphicsTier(nextTier,{quiet:true});
        lastGraphicsTierChange=elapsed;qualityLowWindows=0;qualityHighWindows=0;
      }
    }
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

  async function shareDriveSG(){
    const url=`${location.origin}${location.pathname}`;
    const data={title:'DriveSG · Toa Payoh',text:'Drive Toa Payoh in your browser.',url};
    try{
      if(navigator.share){await navigator.share(data);return;}
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);showToast('DriveSG link copied');return;}
    }catch(err){if(err?.name==='AbortError')return;}
    showToast('Use Safari Share → Add to Home Screen');
  }

  function recordDiagnostic(type,detail){
    try{
      const key='drivesg-diagnostics-v1';
      const current=JSON.parse(localStorage.getItem(key)||'[]');
      current.push({
        at:new Date().toISOString(),build:BUILD_ID,type:String(type||'error').slice(0,48),
        detail:String(detail||'').slice(0,260),mapMode,graphicsTier,
        navigation:navigation?.active?(navigation.mode||'active'):'none'
      });
      while(current.length>12)current.shift();
      localStorage.setItem(key,JSON.stringify(current));
    }catch(_){}
  }

  function installProductionGuards(){
    if(guardsInstalled)return;guardsInstalled=true;
    window.addEventListener('error',e=>recordDiagnostic('window-error',e?.message||e?.error?.message||'Unknown error'));
    window.addEventListener('unhandledrejection',e=>recordDiagnostic('promise-rejection',e?.reason?.message||e?.reason||'Unhandled rejection'));
    window.addEventListener('offline',()=>{setMapState('offline');showToast('Connection lost · cached map available');});
    window.addEventListener('online',()=>{setMapState(mapMode==='live'?'live':'offline');showToast('Back online');backendCircuitUntil=0;backendFailureCount=0;});
    window.addEventListener('pagehide',()=>{
      clearInputs();
      engineAudio?.ctx?.suspend?.().catch?.(()=>{});
      while(oneMapTileCache.size>32)oneMapTileCache.delete(oneMapTileCache.keys().next().value);
    });
    window.addEventListener('pageshow',()=>{if(engineSoundOn)engineAudio?.ctx?.resume?.().catch?.(()=>{});});
  }

  function bindFreeLook(canvas){
    if(!canvas)return;
    const blocked=()=>Boolean(
      els.placesPanel?.classList.contains('open')||
      els.hopMapOverlay?.classList.contains('show')||
      els.creditsOverlay?.classList.contains('show')||
      els.challengeResult?.classList.contains('show')||
      els.journeyPostcard?.classList.contains('show')||
      els.loader?.classList.contains('show')
    );
    canvas.addEventListener('pointerdown',e=>{
      if(blocked())return;
      cameraLookPointer=e.pointerId;cameraLookActive=true;cameraLookLast={x:e.clientX,y:e.clientY};
      canvas.setPointerCapture?.(e.pointerId);
    },{passive:true});
    canvas.addEventListener('pointermove',e=>{
      if(cameraLookPointer!==e.pointerId)return;
      const dx=e.clientX-cameraLookLast.x,dy=e.clientY-cameraLookLast.y;cameraLookLast={x:e.clientX,y:e.clientY};
      cameraLookYaw=THREE.MathUtils.clamp(cameraLookYaw-dx*.0065,-1.12,1.12);
      cameraLookPitch=THREE.MathUtils.clamp(cameraLookPitch-dy*.0035,-.20,.20);
    },{passive:true});
    const end=e=>{
      if(cameraLookPointer!==e.pointerId)return;
      cameraLookPointer=null;cameraLookActive=false;
      try{canvas.releasePointerCapture?.(e.pointerId);}catch(_){}
    };
    canvas.addEventListener('pointerup',end,{passive:true});
    canvas.addEventListener('pointercancel',end,{passive:true});
  }

  function setCreditsOpen(open){
    if(!els.creditsOverlay)return;
    els.creditsOverlay.classList.toggle('show',Boolean(open));
    document.body.classList.toggle('credits-open',Boolean(open));
  }

  function bindUi() {
    els.placesBtn.addEventListener('click',()=>setPanelOpen(!els.placesPanel.classList.contains('open')));
    els.closePanelBtn.addEventListener('click',closePanel);
    els.resetBtn.addEventListener('click',resetCar);
    els.lightingBtn?.addEventListener('click',cycleLightingMode);
    els.soundBtn.addEventListener('click',toggleEngineSound);
    els.cameraBtn?.addEventListener('click',cycleCameraMode);
    els.shareBtn?.addEventListener('click',shareDriveSG);
    els.creditsBtn?.addEventListener('click',()=>setCreditsOpen(true));
    els.creditsChip?.addEventListener('click',()=>setCreditsOpen(true));
    els.creditsCloseBtn?.addEventListener('click',()=>setCreditsOpen(false));
    els.creditsOverlay?.addEventListener('click',e=>{if(e.target===els.creditsOverlay)setCreditsOpen(false);});
    els.journeyContinueBtn?.addEventListener('click',closeJourneyPostcard);
    els.journeyAnotherBtn?.addEventListener('click',()=>{closeJourneyPostcard();setPanelOpen(true);openDiscoverView();});
    els.journeyPostcard?.addEventListener('click',e=>{if(e.target===els.journeyPostcard)closeJourneyPostcard();});
    els.cancelNavBtn.addEventListener('click',()=>{if(challenge.active)cancelChallenge();else if(guidedDrive?.active){cancelGuidedDrive({quiet:true});clearNavigation();}else clearNavigation();});
    els.navigateModeBtn.addEventListener('click',()=>setPlaceMode('navigate'));
    els.startModeBtn.addEventListener('click',()=>setPlaceMode('start'));
    els.challengeModeBtn?.addEventListener('click',()=>setPlaceMode('challenge'));
    els.discoverSingaporeBtn?.addEventListener('click',openDiscoverView);
    els.discoverBackBtn?.addEventListener('click',closeDiscoverView);
    els.hopMapBtn?.addEventListener('click',openHopMap);
    els.hopMapCloseBtn?.addEventListener('click',closeHopMap);
    els.hopMapCanvas?.addEventListener('pointerup',handleHopMapTap);
    els.hopNavigateBtn?.addEventListener('click',hopMapNavigate);
    els.hopStartBtn?.addEventListener('click',hopMapStart);
    els.discoveryCardClose?.addEventListener('click',dismissDiscoveryCard);
    els.challengeDoneBtn?.addEventListener('click',finishChallengeAndClose);
    els.challengeAgainBtn?.addEventListener('click',replayLastChallenge);
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
      if(e.key.toLowerCase()==='c')cycleCameraMode();
      if(e.key==='Escape'){
        if(els.hopMapOverlay?.classList.contains('show'))closeHopMap();
        else if(discoveryViewOpen)closeDiscoverView();
      }
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

  function clearInputs() {
    input.gas=input.brake=input.steer=0;
    reverseHold=0;
    if(speedMps>-.08)reverseEngaged=false;
    els.gasBtn.classList.remove('active');
    els.brakeBtn.classList.remove('active','reverse-ready');
    const brakeLabel=els.brakeBtn?.querySelector('span');if(brakeLabel)brakeLabel.textContent='BRAKE';
    updateSteerKnob(0);
  }

  function setPanelOpen(open) {
    if(open&&miniMapExpanded)toggleMiniMapExpanded();
    if(open){setPlaceMode(placeMode);buildRecentDestinations();buildChallengeButtons();refreshPresetDistances();}
    els.placesPanel.classList.toggle('open',open);
    document.body.classList.toggle('panel-open',open);
    clearInputs();
    if(!open)showDriveHint();
  }
  function closePanel(){setPanelOpen(false);}

  function maybeShowExperienceHint(){
    try{
      if(localStorage.getItem('drivesg-experience-hint-v1'))return;
      localStorage.setItem('drivesg-experience-hint-v1','1');
    }catch(_){}
    setTimeout(()=>{
      if(!els.placesPanel?.classList.contains('open')&&!els.hopMapOverlay?.classList.contains('show'))showToast('Tip · drag the road view to look around · ◉ changes camera');
    },3300);
  }

  function showDriveHint(){clearTimeout(hintTimer);els.driveHint.classList.add('show');hintTimer=setTimeout(()=>els.driveHint.classList.remove('show'),4200);}
  function hideHint(){clearTimeout(hintTimer);els.driveHint.classList.remove('show');}

  async function useCurrentLocation() {
    if(!navigator.geolocation){els.searchMsg.textContent='Location is not available in this browser.';return;}
    els.searchMsg.textContent='Getting your location…';
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const lat=pos.coords.latitude,lon=pos.coords.longitude;
        if(!insideSingapore(lat,lon)){els.searchMsg.textContent='Your location is outside Toa Payoh.';return;}
        handlePlaceChoice({name:'My location',subtitle:'Current location',lat,lon});
      },
      ()=>{els.searchMsg.textContent='Safari did not provide your location. You can pick a place below instead.';},
      {enableHighAccuracy:false,timeout:9000,maximumAge:120000}
    );
  }

  async function searchSingapore(query) {
    const key=query.trim().toLowerCase();
    els.searchMsg.textContent='Searching Toa Payoh…';
    try{
      let place=geocodeCache.get(key);
      if(!place){
        const controller=new AbortController();
        const timeoutId=setTimeout(()=>controller.abort(),9000);
        try{
          if(BACKEND_ACTIVE){
            try{
              const res=await backendFetch(`/api/geocode?q=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'},signal:controller.signal});
              if(res.ok){const data=await res.json();const lat=Number(data.lat),lon=Number(data.lon);if(insideSingapore(lat,lon))place={name:data.name||query,subtitle:data.subtitle||'Toa Payoh destination',lat,lon};}
            }catch(err){console.warn('DriveSG geocode backend bypass',err?.message||err);}
          }
          if(!place){
            const url=`${GEOCODE_ENDPOINT}?format=jsonv2&limit=1&countrycodes=sg&accept-language=en&q=${encodeURIComponent(query+', Toa Payoh, Singapore')}`;
            const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
            if(!res.ok)throw new Error(`Search ${res.status}`);
            const results=await res.json();if(!results.length)throw new Error('No match');
            const lat=Number(results[0].lat),lon=Number(results[0].lon);if(!insideSingapore(lat,lon))throw new Error('Outside Toa Payoh');
            const label=(results[0].display_name||query).split(',')[0];
            place={name:label,subtitle:'Search result',lat,lon};
          }
        }finally{clearTimeout(timeoutId);}
        geocodeCache.set(key,place);while(geocodeCache.size>30)geocodeCache.delete(geocodeCache.keys().next().value);
      }
      els.searchMsg.textContent='';
      handlePlaceChoice(place);
    }catch(err){console.warn(err);els.searchMsg.textContent='Try a Toa Payoh road or place.';}
  }

  function insideSingapore(lat,lon){return lat>=SG_BOUNDS.minLat&&lat<=SG_BOUNDS.maxLat&&lon>=SG_BOUNDS.minLon&&lon<=SG_BOUNDS.maxLon;}

  function resetSessionStats(){
    sessionDistanceM=0;
    sessionTopSpeedKmh=0;
    reverseHold=0;
    lastRoadLabel='';
    if(els.tripDistance)els.tripDistance.textContent='0 m';
    if(els.topSpeed)els.topSpeed.textContent='0';
    if(els.roadName)els.roadName.textContent=currentLocationName || 'Toa Payoh road';
  }

  function formatTripDistance(meters){
    if(meters<1000)return `${Math.round(meters)} m`;
    return `${(meters/1000).toFixed(meters<10000?1:0)} km`;
  }

  function showLoader(text,pct){els.loader.classList.remove('hidden');els.loaderTitle.textContent='Loading Toa Payoh';setProgress(pct,text);}
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
