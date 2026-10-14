# 实际使用的麦当劳 MCP 工具（Skill 参考）

来源：官方仓库 M-China/mcd-mcp-server（README 更新至 2026-10-01）。本清单描述被 McArena 引用的只读工具；以仓库实测 schema 快照为准。

| 工具 | 官方描述 | McArena 用途 |
|---|---|---|
| now-time-info | 获取当前时间信息 | 任务卡时间锚 |
| query-nearby-stores | 查询附近可用门店 | 比赛门店选择 |
| query-meals | 查询当前可售卖的餐品列表 | 菜单数据 |
| query-meal-detail | 查询餐品详情 | 套餐组成与替换选项 |
| calculate-price | 商品价格计算 | 唯一计价权威（金额/配送费/优惠/应付总价） |
| query-store-coupons | 查询当前门店可用优惠券列表 | 优惠利用维度 |
| list-nutrition-foods | 餐品营养信息列表 | 营养均衡维度（能量/蛋白质/脂肪/碳水/钠） |
| campaign-calendar | 活动日历查询 | 主题任务卡素材 |

接入：Streamable HTTP，`https://mcp.mcd.cn`，`Authorization: Bearer <token>`；限流 600 次/分钟。
