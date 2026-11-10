# BLD 2.1.12 Beta — HERE 最近道路吸附优化

## 本次目标

让 HERE 自动算路创建新站点时，尽可能接近 BLD 原有高德自动算路的道路吸附方式：按照点击坐标到道路几何的实际距离选择最近道路，不按道路等级、道路重要性或路线代价给道路排序。

## 2.1.11 的问题

2.1.11 使用 `radius=20;radiusPenalty=300`。这仍然把候选道路的最终选择交给 HERE Routing API；`radiusPenalty` 只是对候选位置增加空气距离代价，并不保证几何距离最近。因此在并行道路、路口或不同等级道路附近仍可能选错。

## 2.1.12 的处理方式

1. 使用同一个 HERE API Key 请求 HERE Vector Tile API v2：`/v2/vectortiles/base/mc/{z}/{x}/{y}/omv`。
2. 以 zoom 17 读取点击位置附近、覆盖 60 米搜索范围的道路瓦片；瓦片请求并行执行，单个请求 8 秒超时，并在当前页面会话中缓存已解析的瓦片。
3. 解析 OMV / Map Vector Tile protobuf 数据中的 `roads` 图层，提取道路折线。
4. 统一比较 `highway`、`major_road`、`minor_road` 三类机动车道路。道路等级不参与排序；排除明确标为私有、不可公共通行或施工中的道路。
5. 对每一条道路线段计算点击点到线段的垂直投影点及距离，选取 60 米范围内距离最小的那个点。
6. 将该投影点作为 HERE Routing API v8 的 destination，使用 `transportMode=bus` 算路。移除 `snapRadius`、`radius` 和 `radiusPenalty`，不再让路由器通过道路重要性或距离权重选择候选道路。
7. 新站点优先保存本地计算出的最近道路投影点；HERE 实际用于路线计算的终点仍保留为诊断数据。如果最近的道路不能完成 bus 模式算路，则自动以用户原始点击坐标重试 HERE 原生匹配。

## 回退与提示

- Vector Tile API 请求失败、账号未开通该服务、瓦片无道路数据或 60 米范围内没有符合条件的道路时，自动回退到 HERE Routing API 原生匹配，并显示提示。
- 最近道路的 bus 模式路线计算失败时，也会回退到原始点击点重新算路。
- HERE 本地最近道路搜索半径为 60 米，终点写入安全范围为 65 米。超出安全范围不会移动站点。
- HERE 自动算路等待提示延长至 30 秒，以容纳道路瓦片读取和正式算路两个步骤。

## 重要限制

- 同一个 Key 需要有 HERE Vector Tile API v2 的访问权限。若只有 Routing API 权限，程序会回退到 HERE 原生匹配；请检查 HERE Platform 项目/服务权限。
- Vector Tile API 是按交易计费的服务；每次吸附读取点击点附近必要的 1–4 张 zoom 17 瓦片，并对重复瓦片做页面会话缓存。具体费用以 HERE 账户套餐为准。
- 道路几何来自 HERE Vector Tile，公交可通行性仍由 HERE Routing API 的 bus 模式决定。若最近几何道路不支持 bus 模式，将触发原始点击点回退。
- HERE 对靠近交叉口的 waypoint 仍可能在路线几何中使用路口位置；本版优先保留本地几何最近投影点作为站点坐标，因此极少数情况下，路线折线末端与站点坐标之间可能存在很短的连接段。控制台会记录偏差超过 15 米的情况。
- 桥梁、隧道和立交在二维平面上可能出现几何重叠；若不同高度道路坐标完全重叠，仅靠二维最近距离无法判断用户想选哪一层。

## Key 与安全

不把用户的 HERE API Key 写入源码。继续在 BLD「设置」中的 HERE API Key 字段填写；该 Key 供 Routing、Browse 和 Vector Tile 服务调用。请确认 HERE Platform 已启用相应服务，并为 Key 配置允许的 API/项目限制。由于 Key 曾在聊天中明文出现，建议在 HERE 控制台轮换后再继续使用。

## 本次检查

- `node --check tools/international-services.js`：通过。
- `node --check components/TabStation.js`：通过。
- `node --check main.js`：通过。
- 使用合成 OMV protobuf 瓦片测试 `roads` 图层、属性、线几何解码：通过。
- 使用模拟 Vector Tile 与模拟 Routing API 的集成测试：确认 HERE 请求 destination 采用几何最近投影点，且不再发送 `radius`、`radiusPenalty` 或 `snapRadius`：通过。
- 未使用真实 HERE Key 进行在线调用；因此尚未验证当前账户的 Vector Tile API 权限、配额和特定地区道路数据覆盖，也未进行真实地图交互测试。
