declare const domainIdBrand: unique symbol

export type Brand<Value, Name extends string> = Value & {
  readonly [domainIdBrand]: Name
}

export type GameId = Brand<string, 'GameId'>
export type PlayerId = Brand<string, 'PlayerId'>
export type TileId = Brand<string, 'TileId'>
export type VertexId = Brand<string, 'VertexId'>
export type EdgeId = Brand<string, 'EdgeId'>
export type PortId = Brand<string, 'PortId'>
export type DevelopmentCardId = Brand<string, 'DevelopmentCardId'>
export type TradeId = Brand<string, 'TradeId'>
export type CommandId = Brand<string, 'CommandId'>
export type AiProfileId = Brand<string, 'AiProfileId'>

