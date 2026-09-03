import { Button, ButtonGroup, Divider, Paper, Stack, Typography } from '@mui/material'
import type { GameCommand } from '../../game/contracts/commands.ts'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { BuildMode } from '../../application/stores/ui-interaction-store.ts'

export interface ActionPanelProps {
  readonly view: PlayerView
  readonly buildMode: BuildMode
  readonly busy: boolean
  readonly onBuildModeChange: (mode: BuildMode) => void
  readonly onCommand: (command: GameCommand) => void
  readonly onOpenMaritimeTrade: () => void
  readonly onOpenDomesticTrade: () => void
}

function instruction(view: PlayerView, buildMode: BuildMode): string {
  const pending = view.pendingDecision
  if (pending?.type === 'DISCARD_RESOURCES') return `Choose exactly ${pending.requiredCount} cards to discard.`
  if (pending?.type === 'AWAITING_DISCARDS') return 'Waiting for the other players to discard.'
  if (pending?.type === 'MOVE_ROBBER') return 'Choose a highlighted tile for the robber.'
  if (pending?.type === 'CHOOSE_ROBBER_TARGET') return 'Choose a player beside the robber.'
  if (pending?.type === 'PLACE_FREE_ROADS') return `Place ${pending.remainingRoadCount} highlighted free road${pending.remainingRoadCount === 1 ? '' : 's'}.`
  if (pending?.type === 'CHOOSE_INVENTION_RESOURCES') return 'Choose two resources from the bank.'
  if (pending?.type === 'CHOOSE_MONOPOLY_RESOURCE') return 'Choose one resource type to claim.'
  if (pending?.type === 'RESPOND_TO_TRADE') return 'Respond to the proposed trade.'
  if (pending?.type === 'TRADE_IN_PROGRESS') return 'Waiting for the other player to answer the trade.'
  if (view.publicGame.turn.phase === 'SETUP_SETTLEMENT') return 'Choose a highlighted vertex for your settlement.'
  if (view.publicGame.turn.phase === 'SETUP_ROAD') return 'Choose a highlighted edge for your road.'
  if (buildMode !== null) return `Choose a highlighted location for your ${buildMode.toLowerCase()}.`
  return 'Choose an available action.'
}

export function ActionPanel({
  view,
  buildMode,
  busy,
  onBuildModeChange,
  onCommand,
  onOpenMaritimeTrade,
  onOpenDomesticTrade,
}: ActionPanelProps): React.JSX.Element {
  const actions = view.legalActions
  return (
    <Paper component="section" elevation={3} sx={{ p: 2 }}>
      <Typography component="h2" sx={{ fontWeight: 800 }} variant="h6">Actions</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">{instruction(view, buildMode)}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {actions.canRollDice ? (
          <Button disabled={busy} onClick={() => onCommand({ type: 'ROLL_DICE' })} variant="contained">Roll dice</Button>
        ) : null}
        {actions.legalRoadEdgeIds.length > 0 && view.publicGame.turn.phase === 'ACTION' ? (
          <Button
            disabled={busy}
            onClick={() => onBuildModeChange(buildMode === 'ROAD' ? null : 'ROAD')}
            variant={buildMode === 'ROAD' ? 'contained' : 'outlined'}
          >Build road</Button>
        ) : null}
        {actions.legalSettlementVertexIds.length > 0 ? (
          <Button
            disabled={busy}
            onClick={() => onBuildModeChange(buildMode === 'SETTLEMENT' ? null : 'SETTLEMENT')}
            variant={buildMode === 'SETTLEMENT' ? 'contained' : 'outlined'}
          >Build settlement</Button>
        ) : null}
        {actions.legalCityUpgradeVertexIds.length > 0 ? (
          <Button
            disabled={busy}
            onClick={() => onBuildModeChange(buildMode === 'CITY' ? null : 'CITY')}
            variant={buildMode === 'CITY' ? 'contained' : 'outlined'}
          >Upgrade city</Button>
        ) : null}
        {actions.canBuyDevelopmentCard ? (
          <Button disabled={busy} onClick={() => onCommand({ type: 'BUY_DEVELOPMENT_CARD' })} variant="outlined">Buy development</Button>
        ) : null}
        {actions.legalMaritimeTradeOptions.length > 0 ? (
          <Button disabled={busy} onClick={onOpenMaritimeTrade} variant="outlined">Maritime trade</Button>
        ) : null}
        {actions.canProposeTrade ? (
          <Button disabled={busy} onClick={onOpenDomesticTrade} variant="outlined">Propose trade</Button>
        ) : null}
        {actions.canFinishFreeRoadPlacement ? (
          <Button disabled={busy} onClick={() => onCommand({ type: 'FINISH_FREE_ROAD_PLACEMENT' })} variant="outlined">Finish road placement</Button>
        ) : null}
      </Stack>
      {actions.canEndTurn ? (
        <>
          <Divider sx={{ my: 2 }} />
          <Button color="secondary" disabled={busy} fullWidth onClick={() => onCommand({ type: 'END_TURN' })} variant="contained">End turn</Button>
        </>
      ) : null}
      {buildMode === null ? null : (
        <ButtonGroup fullWidth sx={{ mt: 1.5 }}>
          <Button onClick={() => onBuildModeChange(null)}>Cancel build selection</Button>
        </ButtonGroup>
      )}
    </Paper>
  )
}
