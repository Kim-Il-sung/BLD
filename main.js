const BLDAtGtfsCache = new WeakMap();
const bld = Vue.createApp({
    setup() {
        const blankLineFile = {
            "fileVersion": 1,
            "cityName": "",
            "lineName": "",
            "lineColor": "#00D3FC",
            "remark": "",
            "lineType": 1,
            "company": "",
            "route": {
                "up": [],
                "down": []
            },
            "serviceTime": {
                "up": "",
                "down": ""
            },
            "fare": {
                "strategy": "multilevel",
                "enableRing": "0",
                "desc": "",
                "single": {
                    "price": "1.00"
                },
                "multilevel": {
                    "startPrice": "0.00",
                    "startingDistance": "0.00",
                    "magnification": "0.20",
                    "magnificationAttenuation": "0.00",
                    "increaseBase": "1.00",
                    "maxPrice": "Infinity",
                },
                "text": {
                    "text": ""
                },
                "customize": {
                    "formula": "0.2*distance"
                }
            }
        };
        return{
            blankLineFile,
        }
    },
    data() {
        return {
            currentTab: 'stations',
            tabs: [
                {id: 'stations', name: '设站'},
                {id: 'fare', name: '票价'},
                {id: 'schematic', name: '图示'},
                {id: 'settings', name: '设置'},
                {id: 'about', name: '关于'}
            ],
            settings: {
                general: {
                    mainDirection: {
                        name: '正方向',
                        current: '0',
                        default: '0',
                        type: 'select',
                        options: [
                            {name: '上行', value: '0'},
                            {name: '下行', value: '1'},
                        ]
                    },
                    enableUndoFunc: {
                        name: '撤销功能',
                        current: '1',
                        default: '1',
                        type: 'select',
                        options: [
                            {name: '禁用', value: '0'},
                            {name: '启用', value: '1'},
                        ]
                    },
                    apiKey: {
                        name: 'API Key',
                        current: '',
                        default: '',
                        type: 'input',
                        placeholder: '高德地图 Web端 JSAPI Key',
                        description: '刷新页面后生效',
                        onChange: (value) => {
                            if(!value.match(/^[0-9a-f]{32}$/)){
                                this.showMessage(["设置 API Key", "", "API Key 应为 32 位十六进制字符", false]);
                            }else if(this.settings.general.securityKey.current.match(/^[0-9a-f]{32}$/)){
                                this.showMessage(["设置 API Key", "", "API Key 和安全密钥已设置，刷新页面后生效哦～", false]);
                            }
                        },
                    },
                    securityKey: {
                        name: '安全密钥',
                        current: '',
                        default: '',
                        type: 'password',
                        placeholder: '高德地图安全密钥（JSAPI）',
                        description: '刷新页面后生效',
                        onChange: (value) => {
                            if(!value.match(/^[0-9a-f]{32}$/)){
                                this.showMessage(["设置安全密钥", "", "安全密钥应为 32 位十六进制字符", false]);
                            }else if(this.settings.general.apiKey.current.match(/^[0-9a-f]{32}$/)){
                                this.showMessage(["设置安全密钥", "", "API Key 和安全密钥已设置，刷新页面后生效哦～", false]);
                            }
                        },
                    },
                    routingProvider: {
                        name: '算路 API', current: 'AMap', default: 'AMap', type: 'select',
                        options: [
                            {name: '高德（国内）', value: 'AMap'},
                            {name: 'HERE（境外公交车辆模式，Beta）', value: 'HERE'},
                            {name: 'OpenStreetMap / OpenRouteService', value: 'ORS'}
                        ],
                        description: 'HERE bus 模式目前为 Beta；ORS 使用 OSM 道路数据。此项控制自动算路，不改变当前地图底图。'
                    },
                    hereKey: { name: 'HERE API Key', current: '', default: '', type: 'password', placeholder: 'HERE Platform API Key', description: '同一 HERE Platform App API Key 用于 Routing API v8、Geocoding & Search API v7 和 Vector Tile API v2（最近道路几何匹配）；请确认账户已开通对应服务。' },
                    stationSearchProvider: { name: '站点周边识别 API', current: 'AUTO', default: 'AUTO', type: 'select', options: [{name: '自动（HERE 算路时使用 HERE 搜索，否则使用高德）', value: 'AUTO'}, {name: '高德周边搜索', value: 'AMap'}, {name: 'HERE Browse（公交站）', value: 'HERE'}], description: 'HERE 模式调用 Browse API 搜索 200 米内的 Bus Stop / Bus Station；不改变底图和算路服务。' },
                    orsKey: { name: 'OpenRouteService API Key', current: '', default: '', type: 'password', placeholder: 'OpenRouteService API Key', description: '用于 OSM 道路寻路；在 openrouteservice.org 注册获取。' },
                    googleKey: { name: 'Google Maps API Key', current: '', default: '', type: 'password', placeholder: 'Google Maps JavaScript API Key', description: '用于 Google Transit 起终点查询；需启用 Maps JavaScript API 与 Directions 服务及计费。' },
                    atKey: { name: 'AT API Key（可选）', current: '', default: '', type: 'password', placeholder: 'Auckland Transport Subscription Key', description: '本版 AT 静态线路读取采用官方 GTFS ZIP 本地导入；此 Key 为后续 AT REST/Realtime 接口预留。' },
                    mapServiceRegion: {
                        name: '地图服务区域',
                        current: 'domestic',
                        default: 'domestic',
                        type: 'select',
                        options: [
                            {name: '中国大陆（默认）', value: 'domestic'},
                            {name: '境外（新加坡节点）', value: 'oversea_sg'},
                            {name: '境外（德国节点）', value: 'oversea_de'},
                        ],
                        description: '境外模式需提前申请高德 JSAPI 世界地图权限；修改后请刷新页面。',
                    },
                },
                map: {
                    baseLayerProvider: {
                        name: '地图底图服务', current: 'AMap', default: 'AMap', type: 'select',
                        options: [
                            {name: '高德地图底图', value: 'AMap'},
                            {name: 'OpenStreetMap（OSM）', value: 'OSM'}
                        ],
                        description: '只切换道路底图，不改变地图交互和算路 API。OSM 模式仍使用当前地图组件承载站点与线路覆盖物。'
                    },
                    showStationName: {
                        name: '在地图上显示站名',
                        current: '1',
                        default: '1',
                        type: 'select',
                        options: [
                            {name: '不显示', value: '0'},
                            {name: '智能显示 (防碰撞)', value: '1'},
                            {name: '全部显示', value: '0.5'},
                        ]
                    },
                    showOpposite: {
                        name: '显示线路反向',
                        current: '0.4',
                        default: '0.4',
                        type: 'select',
                        options: [
                            {name: '不显示', value: '0'},
                            {name: '半透明显示', value: '0.4'},
                            {name: '不透明显示', value: '1'},
                        ]
                    },
                    mapStyle: {
                        name: '地图风格',
                        current: 'amap://styles/normal',
                        default: 'amap://styles/normal',
                        type: 'select',
                        options: [
                            {name: '默认', value: 'amap://styles/normal'},
                            {name: '马卡龙', value: 'amap://styles/macaron'},
                            {name: '草色青', value: 'amap://styles/fresh'},
                            {name: '远山黛', value: 'amap://styles/whitesmoke'},
                            {name: '月光银', value: 'amap://styles/light'},
                            {name: '靛青蓝', value: 'amap://styles/blue'},
                            {name: '极夜蓝', value: 'amap://styles/darkblue'},
                            {name: '雅土灰', value: 'amap://styles/grey'},
                            {name: '幻影黑', value: 'amap://styles/dark'},
                        ]
                    },
                    lineStrokeWidth: {
                        name: '线路宽度',
                        current: '6',
                        default: '6',
                        type: 'select',
                        options: [
                            {name: '细', value: '2'},
                            {name: '较细', value: '4'},
                            {name: '默认', value: '6'},
                            {name: '较粗', value: '8'},
                            {name: '粗', value: '10'},
                        ]
                    },
                    stationLightness: {
                        name: '站点颜色明度',
                        current: '-64',
                        default: '-64',
                        type: 'select',
                        options: [
                            {name: '黑', value: '-256'},
                            {name: '暗', value: '-64'},
                            {name: '较暗', value: '-32'},
                            {name: '正常', value: '0'},
                            {name: '较亮', value: '32'},
                            {name: '亮', value: '64'},
                            {name: '原版', value: 'origin'},
                        ]
                    },
                    stationStrokeWidth: {
                        name: '站点描边宽度',
                        current: '2',
                        default: '2',
                        type: 'select',
                        options: [
                            {name: '细', value: '1'},
                            {name: '默认', value: '2'},
                            {name: '较粗', value: '3'},
                            {name: '粗', value: '4'},
                        ]
                    },
                    stationFillRadius: {
                        name: '站点大小',
                        current: '5',
                        default: '5',
                        type: 'select',
                        options: [
                            {name: '小', value: '3'},
                            {name: '较小', value: '4'},
                            {name: '默认', value: '5'},
                            {name: '较大', value: '6'},
                            {name: '大', value: '7'},
                        ]
                    },
                },
                fare: {
                    fix: {
                        name: '票价精度',
                        current: '2',
                        default: '2',
                        type: 'select',
                        options: [
                            {name: '整数', value: '0'},
                            {name: '小数点后一位', value: '1'},
                            {name: '小数点后两位', value: '2'},
                        ]
                    },
                    imageQuality: {
                        name: "图片保存质量",
                        current: '{"type":"image/png", "quality": 1.0}',
                        default: '{"type":"image/png", "quality": 1.0}',
                        type: 'select',
                        options: [
                            {name: "PNG 无损", value: '{"type":"image/png", "quality": 1.0}'},
                            {name: "JPG 100%", value: '{"type":"image/jpeg", "quality": 1.0}'},
                            {name: "JPG 90%", value: '{"type":"image/jpeg", "quality": 0.9}'},
                            {name: "JPG 80%", value: '{"type":"image/jpeg", "quality": 0.8}'},
                            {name: "JPG 50%", value: '{"type":"image/jpeg", "quality": 0.5}'},
                            {name: "JPG 25%", value: '{"type":"image/jpeg", "quality": 0.25}'},
                        ]
                    },
                    enableCellColor: {
                        name: '多级票价单元格颜色',
                        current: '1',
                        default: '1',
                        type: 'select',
                        options: [
                            {name: '黑白', value: '0'},
                            {name: '彩色', value: '1'},
                        ]
                    },
                    showStationAhead: {
                        name: '在表格左侧显示站名',
                        current: '0',
                        default: '0',
                        type: 'select',
                        options: [
                            {name: '不显示', value: '0'},
                            {name: '显示', value: '1'},
                        ]
                    },
                    showStationBehind: {
                        name: '在表格右侧显示站名',
                        current: '1',
                        default: '1',
                        type: 'select',
                        options: [
                            {name: '不显示', value: '0'},
                            {name: '显示', value: '1'},
                        ]
                    },
                },
                lineMap: {
                    showLinesByDefault: {
                        name: '默认展示线路',
                        current: '1',
                        default: '1',
                        type: 'select',
                        options: [
                            {name: '展示', value: '1'},
                            {name: '不展示', value: '0'},
                        ]
                    },
                    showStationsByDefault: {
                        name: '默认展示站点',
                        current: '1',
                        default: '1',
                        type: 'select',
                        options: [
                            {name: '展示', value: '1'},
                            {name: '不展示', value: '0'},
                        ]
                    },
                },
            },
            announcement: {
                lastUpdated: 0,
                content: '暂无公告',
            },
            lineFile: deepClone(this.blankLineFile),
            originalLineFile: deepClone(this.blankLineFile),
            undoable: false,
            fileInput: VueReactivity.shallowRef(null),
            fileReader: VueReactivity.shallowRef(null),
            clipboard: new ClipboardJS('#copyLine'),
            modalConfirm: {
                title: '',
                content: ''
            },
            modalLineSearch: {
                dataSource: 'AMap',
                lineName: '',
                city: '',
                chelaile: {
                    province: '',
                    city: '',
                },
                google: { origin: '', destination: '' },
                atGtfsFile: null,
                chinaRailway: {
                    trainCode: '',
                    date: new Date().getFullYear().toString() + (new Date().getMonth() + 1).toString().padStart(2, '0') + new Date().getDate().toString().padStart(2, '0'),
                },
                advanced: null,
                CitiesLoadingPrompt: '正在加载列表…'
            },
            modalLineSearchAdvanced: {
                data: [],
                kind: 'default'
            },
            toast: {
                title: '',
                subtitle: '',
                content: '',
                autohide: true
            },
            regions: {},
            chelaileTempData: {},
            crTempData: {},
        }
    },
    mounted() {
        if(new Date().getDay() == 4){
            for(var i = 0; i < 50; i++){
                console.warn('KaiFengCai crazy thursday V me 50');
            }
        }

        window.onbeforeunload = function(e) {
            var e = window.event || e;
            e.returnValue = ("确定离开页面吗？现有线路内容将丢失。请确保已保存当前线路。");
        };

        this.clipboard.on('success', this.copyLine);
        this.clipboard.on('error', this.copyLineFailed);
        this.fileInput = document.createElement('input');
        this.fileInput.setAttribute('type', 'file');
        this.fileInput.addEventListener('change', this.readFile);
        this.fileReader = new FileReader();
        this.fileReader.addEventListener('load', this.loadLineFromFile);

        var savedSettings;
        const params = new URLSearchParams(window.location.search);
        if(savedSettings = params.get('settings')){
            savedSettings = JSON.parse(new TextDecoder().decode(pako.inflate(Uint8Array.from(atob(savedSettings.replaceAll(' ', '+')), c => c.charCodeAt(0)))));
            // 迁移旧版 settings：将 customizeKey（Key+安全密钥空格分隔）拆分为 apiKey 和 securityKey
            if(savedSettings.general && savedSettings.general.customizeKey){
                const parts = savedSettings.general.customizeKey.current.split(' ');
                savedSettings.general.apiKey = {current: parts[0] || ''};
                savedSettings.general.securityKey = {current: parts[1] || ''};
                delete savedSettings.general.customizeKey;
            }
            for(const type in savedSettings){
                for(const item in savedSettings[type]){
                    this.settings[type][item].current = savedSettings[type][item].current;
                }
            }
            new bootstrap.Modal(document.getElementById('modalNewDomain')).show();
            try{
                history.replaceState(null, '', '/');
            }catch(e){}
        }else if(savedSettings = localStorage.getItem('settings')){
            savedSettings = JSON.parse(savedSettings);
            // 迁移旧版 settings：将 customizeKey（Key+安全密钥空格分隔）拆分为 apiKey 和 securityKey
            if(savedSettings.general && savedSettings.general.customizeKey){
                const parts = savedSettings.general.customizeKey.current.split(' ');
                savedSettings.general.apiKey = {current: parts[0] || ''};
                savedSettings.general.securityKey = {current: parts[1] || ''};
                delete savedSettings.general.customizeKey;
            }
            for(const type in savedSettings){
                for(const item in savedSettings[type]){
                    this.settings[type][item].current = savedSettings[type][item].current;
                }
            }
        }else{
            localStorage.setItem('settings', JSON.stringify(this.settings));
        }

        var announcementLastRead = localStorage.getItem('announcementLastRead') ? localStorage.getItem('announcementLastRead') : 0;
        if(announcementLastRead < this.announcement.lastUpdated){
            this.showMessage(["公告", "", this.announcement.content, false]);
            localStorage.setItem('announcementLastRead', Date.now());
        }

        if (this.settings.general.apiKey.current) {
            window.AMapKey = this.settings.general.apiKey.current;
            if (this.settings.general.securityKey.current) {
                window._AMapSecurityConfig = {
                    securityJsCode: this.settings.general.securityKey.current,
                };
            }
            this.showMessage(["地图加载", "", "如果加载地图出现问题，请检查设置中的 API Key 选项", false]);
        } else {
            this.showMessage(["未设置 API Key", "", "地图等大部分功能将不可用。", false]);
        }

        this.$refs.tabStation.mapInit();
        getContents("https://api.chelaile.net.cn/goocity/city!morecities.action?sign=&s=android&v=&vc=245", this.loadRegions);

        new bootstrap.Modal(document.getElementById("modalImportantNotice")).show();
    },
    methods: {
        setTab(tabId) {
            this.currentTab = tabId;
            this.loadLine();
        },
        toggleTab(tabId) {
            this.setTab(tabId.tab);
        },

        saveOriginal(){
            if(this.settings.general.enableUndoFunc.current == "1"){
                this.originalLineFile = deepClone(this.lineFile);
                this.undoable = true;
            }
        },
        undo(){
            if(this.undoable){
                this.lineFile = deepClone(this.originalLineFile);
                this.undoable = false;
                this.$refs.tabStation.undo();
            }else{
                this.showMessage(["撤销失败", "", "没有可以撤销的内容了…"]);
            }
        },

        loadLineFromReality(){
            this.showModalConfirm("读取线路", "确定读取线路吗？现有线路内容将丢失，请确保已保存当前线路哦~", this.showModalLineSearch);
        },
        loadLineFromRealitySearch(advanced = false){
            if(!this.modalLineSearch.lineName && !['ChinaRailway','AT','Google'].includes(this.modalLineSearch.dataSource)){
                this.showMessage(["读取线路", "", "读取线路失败: 未填写线路名称"]);
                return;
            }
            this.showMessage(["读取线路", "", "正在加载线路…"]);
            if(this.modalLineSearch.dataSource == "AMap"){
                var lineSearch = new AMap.LineSearch({
                    pageIndex: 1,
                    pageSize: advanced?12:1,
                    city: this.modalLineSearch.city || "全国",
                    extensions: "all"
                });
                lineSearch.search(this.modalLineSearch.lineName, advanced?this.getLineFromAmapAdvanced:this.getLineFromAmapUp);
            }else if(this.modalLineSearch.dataSource == "chelaile"){
                if(!this.modalLineSearch.chelaile.city.id){
                    this.showMessage(["读取线路", "", "读取线路失败: 没有选择城市", false]);
                }else{
                    this.modalLineSearch.advanced = advanced;
                    getContents("https://cdn.api.chelaile.net.cn/bus/query!nSearch.action?sign=&s=&v=&vc=245&cityId=" + this.modalLineSearch.chelaile.city.id + "&key=" + encodeURIComponent(this.modalLineSearch.lineName), this.getLineFromChelaile);
                }
            }else if(this.modalLineSearch.dataSource == "ChinaRailway"){
                getContents("https://mobile.12306.cn/wxxcx/alipay/main/travelServiceQrcodeTrainInfo", this.getLineStationsFromChinaRailway, "POST", "application/x-www-form-urlencoded", "startDay=" + this.modalLineSearch.chinaRailway.date + "&trainCode=" + this.modalLineSearch.chinaRailway.trainCode);
            }else if(this.modalLineSearch.dataSource == 'AT'){
                this.searchATGtfs(advanced);
            }else if(this.modalLineSearch.dataSource == 'Google'){
                this.importGoogleTransit();
            }
        },
        selectATGtfsFile(event){ this.modalLineSearch.atGtfsFile = event.target.files && event.target.files[0] || null; },
        async searchATGtfs(advanced = false){
            try{
                if(!this.modalLineSearch.atGtfsFile) throw new Error('请先选择从 AT 官方下载的 GTFS ZIP 文件');
                if(typeof JSZip === 'undefined') throw new Error('GTFS ZIP 解析库未加载，请检查网络后刷新页面');
                const query = (this.modalLineSearch.lineName || '').trim().toLocaleLowerCase();
                if(!query) throw new Error('请输入线路编号或名称');
                this.showMessage(['AT GTFS 搜索','','正在读取线路目录和交路信息…',false]);
                const zip = await JSZip.loadAsync(this.modalLineSearch.atGtfsFile);
                const readText = async name => { const f = zip.file(name); if(!f) throw new Error('GTFS 文件缺少 ' + name); return f.async('text'); };
                const [routesText, tripsText, stopsText] = await Promise.all([readText('routes.txt'), readText('trips.txt'), readText('stops.txt')]);
                const routes = BLDInternational.parseCsv(routesText);
                const trips = BLDInternational.parseCsv(tripsText);
                const stopNameMap = new Map(BLDInternational.parseCsv(stopsText).map(stop => [stop.stop_id, stop.stop_name || stop.stop_id]));
                const searchable = r => [r.route_short_name, r.route_long_name, r.route_id].some(v => (v || '').trim().toLocaleLowerCase().includes(query));
                const allMatches = routes.filter(searchable);
                if(!allMatches.length) throw new Error('AT GTFS 中没有找到相关线路');
                const exactMatches = allMatches.filter(r => [r.route_short_name, r.route_id].some(v => (v || '').trim().toLocaleLowerCase() === query));
                const scopedRoutes = (!advanced && exactMatches.length) ? exactMatches : allMatches;
                const score = r => {
                    const vals = [r.route_short_name, r.route_id, r.route_long_name].map(v => (v || '').trim().toLocaleLowerCase());
                    if(vals[0] === query || vals[1] === query) return 0;
                    if(vals.some(v => v.startsWith(query))) return 1;
                    return 2;
                };
                scopedRoutes.sort((a,b) => score(a)-score(b) || String(a.route_short_name).localeCompare(String(b.route_short_name), undefined, {numeric:true}) || String(a.route_id).localeCompare(String(b.route_id)));
                const routeIds = new Set(scopedRoutes.map(r => r.route_id));
                const candidateTrips = trips.filter(t => routeIds.has(t.route_id));
                if(!candidateTrips.length) throw new Error('匹配线路没有可用的 trips 数据');
                const tripIds = new Set(candidateTrips.map(t => t.trip_id));
                this.showMessage(['AT GTFS 搜索','','正在扫描 stop_times.txt 并整理不同交路（大型文件可能需要一些时间）…',false]);
                const stopTimesText = await readText('stop_times.txt');
                const selectedRows = await BLDInternational.selectCsvRowsByFirstColumn(stopTimesText, tripIds, scanned => {
                    this.showMessage(['AT GTFS 搜索','','正在读取站序记录：已扫描 ' + scanned.toLocaleString() + ' 行…',false]);
                });
                const stopTimesByTrip = new Map();
                selectedRows.forEach(row => {
                    if(!stopTimesByTrip.has(row.trip_id)) stopTimesByTrip.set(row.trip_id, []);
                    stopTimesByTrip.get(row.trip_id).push(row);
                });
                const tripsByRoute = new Map();
                candidateTrips.forEach(t => {
                    if(!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
                    tripsByRoute.get(t.route_id).push(t);
                });
                const routeResults = scopedRoutes.map(route => {
                    const patternMap = new Map();
                    (tripsByRoute.get(route.route_id) || []).forEach(trip => {
                        const times = stopTimesByTrip.get(trip.trip_id) || [];
                        times.sort((a,b) => Number(a.stop_sequence)-Number(b.stop_sequence));
                        if(times.length < 2) return;
                        const stopSequence = times.map(x => x.stop_id).join('\u001f');
                        const directionId = trip.direction_id || '0';
                        const headsign = trip.trip_headsign || '未标注终点';
                        const shapeId = trip.shape_id || '';
                        const key = [directionId, shapeId, headsign, stopSequence].join('\u001e');
                        let pattern = patternMap.get(key);
                        if(!pattern){
                            pattern = {
                                directionId,
                                shapeId,
                                headsign,
                                stopCount: times.length,
                                representativeTripId: trip.trip_id,
                                tripCount: 0,
                                serviceIds: [],
                                firstDeparture: times[0].departure_time || times[0].arrival_time || ''
                            };
                            patternMap.set(key, pattern);
                        }
                        pattern.tripCount++;
                        if(trip.service_id && !pattern.serviceIds.includes(trip.service_id)) pattern.serviceIds.push(trip.service_id);
                    });
                    const tripPatterns = Array.from(patternMap.values()).sort((a,b) => Number(a.directionId)-Number(b.directionId) || a.headsign.localeCompare(b.headsign));
                    tripPatterns.forEach(p => {
                        p.serviceIds.sort();
                        p.stopNames = (stopTimesByTrip.get(p.representativeTripId) || []).slice().sort((a,b) => Number(a.stop_sequence)-Number(b.stop_sequence)).map(row => stopNameMap.get(row.stop_id) || row.stop_id);
                    });
                    return {...route, tripPatterns};
                }).filter(r => r.tripPatterns.length);
                if(!routeResults.length) throw new Error('匹配线路没有找到有效的站序交路');
                BLDAtGtfsCache.set(this, {zip, stopTimesByTrip, routes: routeResults});
                this.modalLineSearchAdvanced.kind = 'AT';
                this.modalLineSearchAdvanced.data = routeResults;
                const modal = new bootstrap.Modal(document.getElementById('modalLineSearchAdvanced'));
                modal.show();
                const exactNote = (!advanced && exactMatches.length) ? '已优先采用完整线路编号匹配。' : '已按相关线路进行搜索。';
                this.showMessage(['AT GTFS 搜索','','找到 ' + routeResults.length + ' 条线路、' + routeResults.reduce((n,r)=>n+r.tripPatterns.length,0) + ' 种交路。' + exactNote]);
            }catch(e){
                console.error(e);
                this.showMessage(['AT GTFS 搜索','','搜索失败：' + (e.message || e),false]);
            }
        },
        async importATGtfsPattern(routeId, patternIndex){
            try{
                const cache = BLDAtGtfsCache.get(this);
                if(!cache) throw new Error('GTFS 搜索缓存已失效，请重新搜索线路');
                const route = cache.routes.find(r => r.route_id === routeId);
                const pattern = route && route.tripPatterns[patternIndex];
                if(!route || !pattern) throw new Error('没有找到所选交路，请重新搜索');
                const times = cache.stopTimesByTrip.get(pattern.representativeTripId) || [];
                if(times.length < 2) throw new Error('所选交路没有足够的站序数据');
                const zip = cache.zip;
                this.showMessage(['AT GTFS 导入','','正在读取站点和原始轨迹…',false]);
                const [stopsText, shapesText, agenciesText] = await Promise.all([
                    zip.file('stops.txt').async('text'),
                    zip.file('shapes.txt') ? zip.file('shapes.txt').async('text') : Promise.resolve(''),
                    zip.file('agency.txt') ? zip.file('agency.txt').async('text') : Promise.resolve('')
                ]);
                const stops = BLDInternational.parseCsv(stopsText);
                const stopMap = new Map(stops.map(st => [st.stop_id, st]));
                let shapeRows = [];
                if(pattern.shapeId && shapesText){
                    shapeRows = await BLDInternational.selectCsvRowsByFirstColumn(shapesText, new Set([pattern.shapeId]), scanned => {
                        this.showMessage(['AT GTFS 导入','','正在筛选 shape 原始轨迹点：已扫描 ' + scanned.toLocaleString() + ' 行…',false]);
                    });
                    shapeRows.sort((a,b) => Number(a.shape_pt_sequence)-Number(b.shape_pt_sequence));
                }
                const built = BLDInternational.buildGtfsRouteNodes(times, stopMap, shapeRows);
                const stationCount = built.nodes.filter(n => n.type === 'station').length;
                if(stationCount < 2) throw new Error('所选交路有效站点不足，无法导入');
                const agencies = agenciesText ? BLDInternational.parseCsv(agenciesText) : [];
                const agency = agencies.find(a => a.agency_id === route.agency_id);
                const rawColor = (route.route_color || '').replace('#','');
                const routeColor = /^[0-9a-fA-F]{6}$/.test(rawColor) ? '#' + rawColor : '#00D3FC';
                const newLine = deepClone(this.blankLineFile);
                newLine.cityName = 'Auckland';
                newLine.lineName = route.route_short_name || route.route_long_name || route.route_id;
                newLine.company = agency?.agency_name || route.agency_id || 'Auckland Transport';
                newLine.lineColor = routeColor;
                newLine.lineType = 2;
                newLine.route.up = built.nodes;
                newLine.route.down = [];
                newLine.remark = 'AT GTFS | direction_id=' + pattern.directionId + ' | ' + pattern.headsign + ' | shape_id=' + (pattern.shapeId || '无');
                this.saveOriginal();
                this.lineFile = newLine;
                this.loadLine();
                const geometryLabel = built.geometryMethod === 'shape_dist_traveled' ? '按 GTFS shape_dist_traveled 精确切分轨迹' : built.geometryMethod === 'forward-projection-fallback' ? '按站点顺序投影到原始轨迹' : '该交路没有可用 shape，当前仅导入站点';
                this.showMessage(['AT GTFS 导入成功','',`${newLine.lineName} · ${pattern.headsign}；${stationCount} 站、${built.waypointCount} 个原始轨迹点；${pattern.tripCount} 个相同交路班次。${geometryLabel}`]);
            }catch(e){
                console.error(e);
                this.showMessage(['AT GTFS 导入失败','',e.message || String(e),false]);
            }
        },
        async importGoogleTransit(){
            try{
                const key=this.settings.general.googleKey.current.trim(); if(!key) throw new Error('请先在设置中填写 Google Maps API Key');
                const {origin,destination}=this.modalLineSearch.google; if(!origin||!destination) throw new Error('请填写起点和终点');
                if(!window.google?.maps?.DirectionsService){ await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly';sc.onload=resolve;sc.onerror=()=>reject(new Error('Google Maps JavaScript API 加载失败'));document.head.appendChild(sc);}); }
                const service=new google.maps.DirectionsService(); const result=await service.route({origin,destination,travelMode:google.maps.TravelMode.TRANSIT,provideRouteAlternatives:true});
                const route=result.routes?.[0]; if(!route) throw new Error('Google Transit 没有返回可用方案');
                const busSteps=[]; route.legs.forEach(leg=>leg.steps.forEach(step=>{if(step.travel_mode==='TRANSIT'&&step.transit?.line?.vehicle?.type==='BUS') busSteps.push(step);}));
                if(!busSteps.length) throw new Error('该出行方案没有公交路段；请更换起终点或确认 Google Transit 在该地区有数据');
                const step=busSteps[0], td=step.transit; const pts=step.path||[];
                this.lineFile=deepClone(this.blankLineFile); this.lineFile.cityName=''; this.lineFile.lineName=td.line.short_name||td.line.name||this.modalLineSearch.lineName||'Google Transit Bus'; this.lineFile.company=(td.line.agencies||[]).map(a=>a.name).join(', '); this.lineFile.lineType=2;
                const start=td.departure_stop, end=td.arrival_stop; const nodes=[{type:'station',name:start.name,lng:start.location.lng(),lat:start.location.lat()}];
                pts.forEach(p=>{const lng=p.lng(),lat=p.lat();if(Math.abs(lng-nodes[nodes.length-1].lng)>0.00002||Math.abs(lat-nodes[nodes.length-1].lat)>0.00002)nodes.push({type:'waypoint',name:'Google 路径点',lng,lat});});
                nodes.push({type:'station',name:end.name,lng:end.location.lng(),lat:end.location.lat()}); this.lineFile.route.up=nodes;
                this.showMessage(['读取线路','','Google Transit 导入成功：'+this.lineFile.lineName+'。注意：这是起终点查询返回的一段公交行程，不代表该线路完整的双向站点清单。']); this.$refs.tabStation.loadMapLine(true);
            }catch(e){console.error(e);this.showMessage(['读取线路','','Google Transit 读取失败：'+e.message,false]);}
        },
        getLineFromAmapAdvanced(status, result){
            if(status != "complete"){
                this.showMessage(["读取线路", "", "读取线路失败: " + status, false]);
                return;
            }else if(!result.lineInfo.length){
                this.showMessage(["读取线路", "", "读取线路失败: 没有结果", false]);
                return;
            }

            this.modalLineSearchAdvanced.data = result.lineInfo;
            var m = new bootstrap.Modal(document.getElementById("modalLineSearchAdvanced"));
            m.show();
        },
        getLineFromAmapAdvancedSelect(selected){
            this.getLineFromAmapUp("complete", {lineInfo: [this.modalLineSearchAdvanced.data[selected]]});
        },
        getLineFromAmapUp(status, result){
            if(status != "complete"){
                this.showMessage(["读取线路", "", "读取线路失败: " + status, false]);
                return;
            }else{
                this.lineFile = deepClone(this.blankLineFile);
                var line = result.lineInfo[0];
                var districtSearch = new AMap.DistrictSearch({
                    level: 'city',
                    subdistrict: 0
                })
                districtSearch.search(line.citycode, this.getLineFromAmapCitySearch);

                this.lineFile.lineName = line.name.replace(/\(.*\)$/, '').replace("内环", "").replace("外环", "").replace("内圈", "").replace("外圈", "");
                this.lineFile.company = line.company;

                if(!line.basic_price || !line.total_price){
                    this.lineFile.fare.strategy = 'text';
                    this.lineFile.fare.text.text = '未知';
                }else if(line.basic_price == line.total_price){
                    this.lineFile.fare.strategy = 'single';
                    this.lineFile.fare.single.price = line.basic_price;
                }else{
                    this.lineFile.fare.strategy = 'text';
                    this.lineFile.fare.text.text = '多级票价 ' + line.basic_price + '~' + line.total_price + '元';
                }
                if(line.stime.length && line.etime.length){
                    this.lineFile.serviceTime.up = line.stime.slice(0, 2) + ':' + line.stime.slice(2) + '~' + line.etime.slice(0, 2) + ':' + line.etime.slice(2);
                }else if(line.timedesc){
                    var time = JSON.parse(decodeURIComponent(line.timedesc));
                    this.lineFile.serviceTime.up = time.allRemark;
                }else{
                    this.lineFile.serviceTime.up = '未知';
                }
                var isBilateral = (line.direc != line.id);
                this.lineFile.lineType = line.loop * 2 + !isBilateral * 1 + 1;
                if(line.uicolor){
                    this.lineFile.lineColor = '#' + line.uicolor;
                }
                this.setStationsFromAmap('up', line.path, line.via_stops);
                if(isBilateral){
                    var lineSearch = new AMap.LineSearch({
                        pageIndex: 1,
                        pageSize: 1,
                        city: city,
                        extensions: "all"
                    });
                    lineSearch.searchById(line.direc, this.getLineFromAmapDown);
                }else{
                    this.loadLine();
                    this.showMessage(["读取线路", "", "读取现有线路内容成功~"]);
                }
                return;
            }
        },
        getLineFromAmapDown(status, result){
            if(status != "complete"){
                this.loadLine();
                this.showMessage(["读取线路", "", "读取线路下行失败: " + status, false]);
                return;
            }else{
                var line = result.lineInfo[0];
                if(line.stime.length && line.etime.length){
                    this.lineFile.serviceTime.down = line.stime.slice(0, 2) + ':' + line.stime.slice(2) + '~' + line.etime.slice(0, 2) + ':' + line.etime.slice(2);
                }else if(line.timedesc){
                    var time = JSON.parse(decodeURIComponent(line.timedesc));
                    this.lineFile.serviceTime.down = time.allRemark;
                }else{
                    this.lineFile.serviceTime.down = '未知';
                }
                this.setStationsFromAmap('down', line.path, line.via_stops);
                this.loadLine();
                this.showMessage(["读取线路", "", "读取现有线路内容成功~"]);
                return;
            }
        },
        getLineFromAmapCitySearch(status, result){
            if(status == "complete"){
                this.lineFile.cityName = result.districtList[0].name;
                this.loadLine();
            }
        },
        setStationsFromAmap(direction, path, stations){
            var route = this.lineFile.route[direction];
            var stationCount = 0;
            path.forEach((node, index) => {
                var newNode;
                if(stations[stationCount].location.getLng() == node.getLng() && stations[stationCount].location.getLat() == node.getLat()){
                    newNode = {
                        'type': 'station',
                        'name': stations[stationCount].name,
                        'lng': stations[stationCount].location.getLng(),
                        'lat': stations[stationCount].location.getLat()
                    };
                    stationCount ++;
                }else{
                    newNode = {
                        'type': 'waypoint',
                        'name': '途经点 #' + Math.abs(CRC32C.str('(' + node.getLng() + ',' + node.getLat() + ')')).toString(16).toUpperCase(),
                        'lng': node.getLng(),
                        'lat': node.getLat()
                    };
                }
                route.splice(index, 0, newNode);
            });
        },
        getLineFromChelaile(searchResult){
            searchResult = searchResult.match(/^\*\*YGKJ(.*)YGKJ##$/)[1];
            try{
                searchResult = JSON.parse(searchResult).jsonr;
            }catch(e){this.showMessage(["读取线路", "", "读取线路失败: " + e, false]);}
            if(searchResult.status != "00"){
                this.showMessage(["读取线路", "", "读取线路失败: " + searchResult.status, false]);
                return;
            }else if(!searchResult.data.result.lineCount){
                this.showMessage(["读取线路", "", "读取线路失败: 没有结果", false]);
                return;
            }

            if(this.modalLineSearch.advanced){
                this.modalLineSearchAdvanced.data = searchResult.data.result.lines;
                var m = new bootstrap.Modal(document.getElementById("modalLineSearchAdvanced"));
                m.show();
            }
            else{
                this.getLineFromChelaileIntro(searchResult.data.result.lines[0]);
            }
        },
        getLineFromChelaileAdvancedSelect(index){
            this.getLineFromChelaileIntro(this.modalLineSearchAdvanced.data[index]);
        },
        getLineFromChelaileIntro(lineIntro){
            this.chelaileTempData.lineIdUp = lineIntro.lineId;
            this.chelaileTempData.cityId = this.modalLineSearch.chelaile.city.id;
            this.lineFile = deepClone(this.blankLineFile);
            this.lineFile.lineName = lineIntro.name;
            this.lineFile.cityName = this.modalLineSearch.chelaile.city.name;
            getContents("https://api.chelaile.net.cn/bus/line!lineDetail.action?sign=&s=&v=&lineName=1&cityId=" + this.chelaileTempData.cityId + "&lineId=" + encodeURIComponent(this.chelaileTempData.lineIdUp), this.getLineFromChelaileUpDetails);
        },
        getLineFromChelaileUpDetails(data){
            data = data.match(/^\*\*YGKJ(.*)YGKJ##$/)[1];
            try{
                data = JSON.parse(data).jsonr;
            }catch(e){this.showMessage(["读取线路", "", "读取线路失败: " + e, false]);}
            this.chelaileTempData.stationsUp = data.data.stations;
            this.chelaileTempData.lineIdDown = data.data.otherlines.length ? data.data.otherlines[0].lineId : null;
            var isLoop = (data.data.line.startSn == data.data.line.endSn);
            var isBilateral = (data.data.otherlines.length > 0);
            this.lineFile.lineType = isLoop * 2 + !isBilateral * 1 + 1;
            this.lineFile.serviceTime.up = data.data.line.firstTime + ' ~ ' + data.data.line.lastTime;
            if(!data.data.line.price){
                this.lineFile.fare.strategy = 'text';
                this.lineFile.fare.text.text = '未知';
            }else if(data.data.line.price.search('~') >= 0){
                this.lineFile.fare.strategy = 'text';
                this.lineFile.fare.text.text = '多级票价 ' + data.data.line.price;
            }else{
                this.lineFile.fare.strategy = 'single';
                this.lineFile.fare.single.price = data.data.line.price.replace('元', '');
            }
            getContents(data.data.jxPath, this.getLineFromChelaileUpRoute);
        },
        getLineFromChelaileUpRoute(data){
            data = data.match(/^\*\*YGKJ(.*)YGKJ##$/)[1];
            this.setRouteFromChelaile('up', this.chelaileTempData.stationsUp, JSON.parse(data).jsonr.data);
            if(this.chelaileTempData.lineIdDown){
                getContents("https://api.chelaile.net.cn/bus/line!lineDetail.action?sign=&s=&v=&lineName=1&cityId=" + this.chelaileTempData.cityId + "&lineId=" + encodeURIComponent(this.chelaileTempData.lineIdDown), this.getLineFromChelaileDownDetails);
            }
            else{
                this.loadLine();
                this.showMessage(["读取线路", "", "读取现有线路内容成功~"]);
            }
        },
        getLineFromChelaileDownDetails(data){
            data = data.match(/^\*\*YGKJ(.*)YGKJ##$/)[1];
            try{
                data = JSON.parse(data).jsonr;
            }catch(e){this.showMessage(["读取线路", "", "读取线路失败: " + e, false]);}
            this.chelaileTempData.stationsDown = data.data.stations;
            this.lineFile.serviceTime.down = data.data.line.firstTime + ' ~ ' + data.data.line.lastTime;
            getContents(data.data.jxPath, this.getLineFromChelaileDownRoute);
        },
        getLineFromChelaileDownRoute(data){
            data = data.match(/^\*\*YGKJ(.*)YGKJ##$/)[1];
            this.setRouteFromChelaile('down', this.chelaileTempData.stationsDown, JSON.parse(data).jsonr.data);
            this.loadLine();
            this.showMessage(["读取线路", "", "读取现有线路内容成功~"]);
        },
        setRouteFromChelaile(direction, stations, route){
            var nodes = route.tra.split(';');
            nodes.forEach(node => {
                var info = node.split(',');
                var newNode;

                var lngLat = wgs84ToGcj02(info[0], info[1]);
                var lng = lngLat[0];
                var lat = lngLat[1];

                if(info.length == 3){
                    var station = stations[parseInt(info[2]) - 1];
                    newNode = {
                        type: 'station',
                        name: station.sn,
                        lng: lng,
                        lat: lat,
                    };
                }else{
                    newNode = {
                        type: 'waypoint',
                        name: '途经点 #' + Math.abs(CRC32C.str('(' + lng + ',' + lat + ')')).toString(16).toUpperCase(),
                        lng: lng,
                        lat: lat
                    };
                }
                this.lineFile.route[direction].push(newNode);
            });

            var lastStation = stations[stations.length - 1];
            var lastStationLngLat = wgs84ToGcj02(lastStation.wgsLng, lastStation.wgsLat);
            this.lineFile.route[direction].push({
                type: 'station',
                name: lastStation.sn,
                lng: lastStationLngLat[0],
                lat: lastStationLngLat[1],
            });
        },
        getLineStationsFromChinaRailway(result){
            result = JSON.parse(result).data.trainDetail;
            if(Object.keys(result).length == 0){
                this.showMessage(["读取线路", "", `读取线路失败：未找到 ${this.modalLineSearch.chinaRailway.date} 车次 ${this.modalLineSearch.chinaRailway.trainCode}`]);
                return;
            }
            let trainCodes = [];
            let timeTable = [];
            let formatTime = (time) => {return time.slice(0, 2) + ':' + time.slice(2)};
            this.lineFile = deepClone(this.blankLineFile);
            this.crTempData.stations = {};
            this.lineFile.lineType = 2;
            this.lineFile.cityName = "中华人民共和国";
            this.lineFile.company = result.stopTime[0].jiaolu_corporation_code;
            this.lineFile.fare.strategy = "text";
            this.lineFile.fare.text.text = "未知";
            for(let station of result.stopTime){
                if(!trainCodes.includes(station.stationTrainCode)){
                    trainCodes.push(station.stationTrainCode);
                }
                this.crTempData.stations[station.stationName] = {
                    type: 'station',
                    name: station.stationName,
                    lng: station.lon,
                    lat: station.lat,
                };
                timeTable.push(`${station.stationName} ${formatTime(station.arriveTime)}到 ${formatTime(station.startTime)}发${station.dayDifference == '0' ? '' : ` (+${station.dayDifference})`}`);
            }
            this.lineFile.lineName = trainCodes.join('/') + '次';
            this.lineFile.serviceTime.up = timeTable.join('\n');
            getContents("https://mobile.12306.cn/wxxcx/alipay/main/getTrainMapLine", this.getLinePathFromChinaRailway, "POST", "application/x-www-form-urlencoded", "startDay=" + this.modalLineSearch.chinaRailway.date + "&trainCode=" + this.modalLineSearch.chinaRailway.trainCode + "&version=v2");
        },
        getLinePathFromChinaRailway(result){
            result = JSON.parse(result).data;
            if(Object.keys(result).length == 0){
                for(let stationName in this.crTempData.stations){
                    let station = this.crTempData.stations[stationName];
                    station.name = station.name.replaceAll(" ", "");
                    this.lineFile.route.up.push(station);
                }
                this.loadLine();
                this.showMessage(["读取线路", "", "车次无具体走向数据，仅获取车站位置"]);
                return;
            }
            for(var section in result){
                if(this.crTempData.stations[section.split('-')[0]]){
                    this.lineFile.route.up.push({
                        type: 'station',
                        name: this.crTempData.stations[section.split('-')[0]].name,
                        lng: parseFloat(this.crTempData.stations[section.split('-')[0]].lng),
                        lat: parseFloat(this.crTempData.stations[section.split('-')[0]].lat),
                    });
                }
                for(let waypoint of result[section].line){
                    this.lineFile.route.up.push({
                        type: 'waypoint',
                        name: '途经点 #' + Math.abs(CRC32C.str('(' + waypoint[0] + ',' + waypoint[1] + ')')).toString(16).toUpperCase(),
                        lng: waypoint[0],
                        lat: waypoint[1],
                    });
                }
            }
            this.lineFile.route.up.push({
                type: 'station',
                name: this.crTempData.stations[section.split('-')[1]].name,
                lng: parseFloat(this.crTempData.stations[section.split('-')[1]].lng),
                lat: parseFloat(this.crTempData.stations[section.split('-')[1]].lat),
            });
            for(let i in this.lineFile.route.up){
                node = this.lineFile.route.up[i];
                if(node.type == "station"){
                    if(node.name.includes(" ")){
                        node.name = node.name.replaceAll(" ", "");
                    }
                    let nearbyWaypoint;
                    if(i == 0){
                        nearbyWaypoint = this.lineFile.route.up[1];
                    }else{
                        nearbyWaypoint = this.lineFile.route.up[i-1];
                    }
                    node.lng = nearbyWaypoint.lng;
                    node.lat = nearbyWaypoint.lat;
                }
            }
            this.loadLine();
            this.showMessage(["读取线路", "", "读取现有线路内容成功~"]);
        },
        loadLine(lineFile = null) {
            if(lineFile){
                this.lineFile = deepClone(lineFile);
            }
            if(this.lineFile.fileVersion > 1){
                this.showMessage(["读取线路", "", "当前打开的是高版本 BLD 所使用的新版文件格式。\n当前版本的 BLD 可能无法解析新版本线路文件。", false]);
            }
            this.undoable = false;
            this.$refs.tabStation.loadLine();
        },

        loadRegions(data){
            data = data.match(/^\*\*YGKJ(.*)YGKJ##$/)[1];
            try{
                JSON.parse(data).jsonr.data.cities.forEach(city => {
                    var province = city.cityProvince.replace('省', '');
                    if(province == '新绛') province = '新疆';
                    if(province !== ''){
                        if(!this.regions.hasOwnProperty(province)){
                            this.regions[province] = {name: province, cities: []};
                        }
                        this.regions[province].cities.push({name: city.cityName, id: city.cityId});
                    }
                });
                if(!JSON.parse(data).jsonr.data.cities.length){
                    throw "没有获取到数据";
                }
            }catch(e){
                modalLineSearch.CitiesLoadingPrompt = '加载失败: ' + e + '，请刷新页面后再试';
            }
        },

        loadLineFromFile(){
            try{
                this.lineFile = deepClone(this.blankLineFile);
                deepCopy(this.lineFile, JSON.parse(this.fileReader.result));
            }catch(e){
                this.showMessage(["读取线路", "", "读取线路失败: " + e, false]);
                return;
            }
            this.loadLine();
        },
        uploadLine() {
            this.showModalConfirm("读取线路", "确定读取线路吗？现有线路内容将丢失，请确保已保存当前线路哦~", this.getFile);
        },
        getFile() {
            if(document.createEvent) {
                var event = document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                this.fileInput.dispatchEvent(event);
            }
            else {
                this.fileInput.click();
            }
        },
        readFile() {
            if(!this.fileInput.files.length){
                return;
            }
            this.fileReader.readAsText(this.fileInput.files[0]);
        },
        loadLineFromClipboard(line){
            try{
                this.lineFile = deepClone(this.blankLineFile);
                deepCopy(this.lineFile, JSON.parse(line));
            }catch(e){
                this.showMessage(["读取线路", "", "读取线路失败: " + e, false]);
                return;
            }
            this.loadLine();
            this.showMessage(["读取线路", "", "读取剪贴板中的线路成功~"]);
        },
        async copyDirectionRoute(direction){
            try{
                const route = deepClone(this.lineFile.route?.[direction] || []);
                if(!route.length) throw new Error((direction === 'up' ? '上行' : '下行') + '没有可复制的数据');
                const payload = { format: 'BLD_DIRECTION_ROUTE', version: 1, sourceDirection: direction, route };
                await navigator.clipboard.writeText(JSON.stringify(payload));
                this.showMessage(['复制方向数据','','已复制' + (direction === 'up' ? '上行' : '下行') + '数据（' + route.filter(n=>n.type==='station').length + '站）。可在另一条线路中选择“读取为下行”。']);
            }catch(e){
                console.error(e);
                this.showMessage(['复制方向数据失败','',e.message || '浏览器未授予剪贴板写入权限，请使用 HTTPS 页面或检查浏览器权限。',false]);
            }
        },
        readDirectionAsDown(){
            const run = async () => {
                try{
                    const text = await navigator.clipboard.readText();
                    const payload = JSON.parse(text);
                    let route = null;
                    if(payload?.format === 'BLD_DIRECTION_ROUTE' && Array.isArray(payload.route)) route = payload.route;
                    else if(Array.isArray(payload)) route = payload;
                    if(!route || !route.length) throw new Error('剪贴板中没有有效的 BLD 单方向线路数据；请先在来源线路中复制上行或下行数据');
                    const valid = route.every(n => n && (n.type === 'station' || n.type === 'waypoint') && Number.isFinite(Number(n.lng)) && Number.isFinite(Number(n.lat)) && Number(n.lng) >= -180 && Number(n.lng) <= 180 && Number(n.lat) >= -90 && Number(n.lat) <= 90);
                    if(!valid) throw new Error('剪贴板数据格式不正确，节点类型或经纬度无效');
                    this.saveOriginal();
                    this.lineFile.route.down = deepClone(route).map(n => ({...n, lng:Number(n.lng), lat:Number(n.lat)}));
                    if(Number(this.lineFile.lineType || 1) % 2 === 0) this.lineFile.lineType = Math.max(1, Number(this.lineFile.lineType) - 1);
                    this.$refs.tabStation.loadLine();
                    this.$refs.tabStation.selectedDirection = 'down';
                    this.$refs.tabStation.loadMapLine(true, true);
                    this.showMessage(['读取为下行成功','','已将剪贴板中的 ' + route.filter(n=>n.type==='station').length + ' 个站点及途经点覆盖到当前线路下行；上行数据保持不变。']);
                }catch(e){
                    console.error(e);
                    this.showMessage(['读取为下行失败','',e.message || '浏览器未授予剪贴板读取权限，请检查页面 HTTPS 和浏览器权限。',false]);
                }
            };
            this.showModalConfirm('读取为下行线路','确定读取剪贴板中的单方向线路数据，并覆盖当前线路的下行吗？当前上行数据不会改变。',run);
        },
        newLine() {
            this.showModalConfirm("新建线路", "确定新建线路吗？现有线路内容将丢失，请确保已保存当前线路哦~", this.loadBlankLine);
        },
        loadBlankLine(){
            this.lineFile = deepClone(this.blankLineFile);
            this.loadLine();
            this.showMessage(["新建线路", "", "新建空白线路成功~"]);
        },
        downloadLine() {
            this.showMessage(["保存线路", "", "正在尝试保存线路到文件，如保存失败，请尝试保存到剪贴板。", false]);
            downloadFile(
                (this.lineFile.lineName.length?this.lineFile.lineName:'未命名线路') + '.bll',
                JSON.stringify(this.lineFile),
                "application/json"
            );
        },
        copyLine() {
            this.showMessage(['保存线路', '', '线路信息已保存至剪贴板~']);
        },
        copyLineFailed() {
            this.showMessage(['保存线路', '', '线路信息保存失败，请手动复制：'.JSON.stringify(lineFile)]);
        },
        pasteLine() {
            this.showModalConfirm("读取线路", "确定读取线路吗？现有线路内容将丢失，请确保已保存当前线路哦~", this.getLineFromClipboard);
        },
        getLineFromClipboard(){
            this.showMessage(["读取线路", "", "正在尝试从剪贴板读取线路，如读取失败，请尝试将内容保存到文件中，再从文件读取。", false]);
            navigator.clipboard.readText().then(this.loadLineFromClipboard);
        },
        showModalConfirmForComponents(data){
            this.showModalConfirm(data.title, data.content, data.execute);
        },
        showModalConfirm(title, content, execute){
            this.modalConfirm.title = title;
            this.modalConfirm.content = content;
            document.getElementById("modalConfirmOK").onclick = execute;
            var m = new bootstrap.Modal(document.getElementById("modalConfirm"));
            m.show();
        },
        showModalLineSearch(){
            this.modalLineSearch.lineName = '';
            // this.modalLineSearch.city = '';
            var m = new bootstrap.Modal(document.getElementById("modalLineSearch"));
            m.show();
        },
        showMessage(data) {
            this.toast.title = data[0];
            this.toast.subtitle = data[1];
            this.toast.content = data[2];
            this.toast.autohide = false; // 将就一下
            // this.toast.autohide = data.length == 4 ? data[3] : true;
            // TODO: ⬆⬇这种写法貌似偶尔会导致显示不出来，下次一定改
            var t = new bootstrap.Toast(document.getElementById("liveToast"));
            t.show();
        },
    },
    watch: {
        settings: {
            handler(newVal){
                localStorage.setItem('settings', JSON.stringify(newVal));
                try{
                    this.$refs.tabStation.loadMapLine(false, false);
                }catch(e){};
            },
            immediate: false,
            deep: true
        }
    }
});

bld.config.errorHandler = (err, vm, info) => {
    alert(err);
};