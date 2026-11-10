# Bus Line Designer 2.1.12 Beta

BLD 2.1.12 优化 HERE 自动算路的终点道路吸附：优先通过 HERE Vector Tile API v2 的 `roads` 图层计算点击位置到道路折线的最近投影点，再使用该坐标调用 HERE Routing API v8（bus 模式）。不再使用 `snapRadius`、`radius` 或 `radiusPenalty` 影响候选道路选择。

若 Vector Tile API 不可用，或最近道路无法完成公交模式路线计算，则自动回退到 HERE 原生 waypoint 匹配。

详细说明见 `BLD-2.1.12-HERE最近道路吸附优化.md`。
