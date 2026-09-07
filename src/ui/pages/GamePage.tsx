import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { PlayerEventView } from '@frontier-isles/game-core/contracts/player-events'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { TradeId } from '@frontier-isles/game-core/model/ids'
import type { ResourceType } from '@frontier-isles/game-core/model/resource'
import type { TradeOffer } from '@frontier-isles/game-core/model/trade'
import type { GatewaySaveStatus } from '../../application/gateways/game-gateway.ts'
import type { BuildMode } from '../../application/stores/ui-interaction-store.ts'
import { PlayableGameBoard } from '../board/PlayableGameBoard.tsx'
import {
  commandForEdgeSelection,
  commandForTileSelection,
  commandForVertexSelection,
  legalEdgesForMode,
  legalVerticesForMode,
} from '../controllers/game-command-controller.ts'
import {
  DiscardDecisionDialog,
  DomesticTradeDialog,
  InventionDecisionDialog,
  MaritimeTradeDialog,
  MonopolyDecisionDialog,
  RobberTargetDialog,
  TradeResponseDialog,
  VictoryDialog,
} from '../dialogs/GameDialogs.tsx'
import { formatEvent, formatPhase } from '../game/ui-format.ts'
import { ActionPanel } from '../panels/ActionPanel.tsx'
import { BankSupplyPanel } from '../panels/BankSupplyPanel.tsx'
import { DevelopmentCardHand } from '../panels/DevelopmentCardHand.tsx'
import { PlayerPanels } from '../panels/PlayerPanels.tsx'
import { ResourceHand } from '../panels/ResourceHand.tsx'

export interface GamePageProps {
  readonly online?: { readonly roomCode: string; readonly status: string; readonly onResync: () => void; readonly resyncDisabled: boolean }
  readonly view: PlayerView
  readonly events: readonly PlayerEventView[]
  readonly buildMode: BuildMode
  readonly aiThinking: boolean
  readonly saveStatus: GatewaySaveStatus
  readonly error: string | null
  readonly busy: boolean
  readonly canRestart: boolean
  readonly onBuildModeChange: (mode: BuildMode) => void
  readonly onCommand: (command: GameCommand) => void
  readonly onSave: () => void
  readonly onRestart: () => void
  readonly onNewGame: () => void
  readonly createTradeId: () => TradeId
}

function playerName(view: PlayerView, playerId: string): string {
  if (view.self.id === playerId) return view.self.name
  return view.opponents.find((player) => player.id === playerId)?.name ?? 'Unknown player'
}

export function GamePage({
  online,
  view,
  events,
  buildMode,
  aiThinking,
  saveStatus,
  error,
  busy,
  canRestart,
  onBuildModeChange,
  onCommand,
  onSave,
  onRestart,
  onNewGame,
  createTradeId,
}: GamePageProps): React.JSX.Element {
  const [maritimeOpen, setMaritimeOpen] = useState(false)
  const [domesticTradeId, setDomesticTradeId] = useState<TradeId | null>(null)
  const [counterTradeId, setCounterTradeId] = useState<TradeId | null>(null)
  const pendingTrade = view.pendingDecision?.type === 'RESPOND_TO_TRADE'
    ? view.pendingDecision.offer
    : undefined
  const currentName = playerName(view, view.publicGame.turn.currentPlayerId)
  const lastRoll = view.publicGame.turn.lastRoll
  const legalVertexIds = legalVerticesForMode(view, buildMode)
  const legalEdgeIds = legalEdgesForMode(view, buildMode)

  const sendBoardCommand = (command: GameCommand | null): void => {
    if (!busy && command !== null) onCommand(command)
  }

  const submitTrade = (offer: TradeOffer): void => {
    if (pendingTrade === undefined) onCommand({ type: 'PROPOSE_TRADE', offer })
    else onCommand({ type: 'COUNTER_TRADE', previousTradeId: pendingTrade.tradeId, offer })
    setDomesticTradeId(null)
    setCounterTradeId(null)
  }

  return (
    <Box component="main" sx={{ minHeight: '100vh', overflowX: 'hidden', pb: 3 }}>
      <Box
        component="header"
        sx={{
          background: 'linear-gradient(120deg, #284f49, #3f756c)',
          color: 'primary.contrastText',
          mb: 2,
          py: 1.5,
        }}
      >
        <Container maxWidth={false}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography component="h1" sx={{ fontWeight: 800 }} variant="h5">Frontier Isles</Typography>
              {online === undefined ? null : <Typography variant="body2">Online Multiplayer · Room <span data-testid="room-code">{online.roomCode}</span></Typography>}
              <Typography sx={{ opacity: 0.82 }} variant="body2">
                Turn {view.publicGame.turn.turnNumber} · {currentName} · {formatPhase(view.publicGame.turn.phase)}
              </Typography>
            </Box>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {lastRoll === null ? null : <Chip label={`Last roll: ${lastRoll.dice[0]} + ${lastRoll.dice[1]} = ${lastRoll.total}`} sx={{ bgcolor: 'rgba(255,255,255,.92)' }} />}
              <Chip aria-live="polite" role="status" label={online?.status ?? (aiThinking ? 'AI thinking…' : `Save: ${saveStatus.toLowerCase()}`)} sx={{ bgcolor: 'rgba(255,255,255,.92)' }} />
              {online === undefined ? <>
                <Button color="inherit" disabled={busy} onClick={onSave} variant="outlined">Save</Button>
                <Button color="inherit" disabled={busy || !canRestart} onClick={onRestart}>Restart seed</Button>
                <Button color="inherit" disabled={busy} onClick={onNewGame}>New game</Button>
              </> : <Button color="inherit" disabled={online.resyncDisabled} onClick={online.onResync} variant="outlined">Resync game</Button>}
            </Stack>
          </Stack>
        </Container>
        {aiThinking ? <LinearProgress color="secondary" sx={{ mt: 1.5 }} /> : null}
      </Box>
      <Container maxWidth={false}>
        {error === null ? null : <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {online !== undefined && view.publicGame.winnerId === null && (view.legalActions.permittedCommandTypes?.length ?? 0) === 0
          ? <Alert severity="info" sx={{ mb: 2 }}>Waiting for another player’s decision.</Alert> : null}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '250px minmax(0, 1fr) 310px' },
          }}
        >
          <Box sx={{ minWidth: 0, order: { xs: 2, lg: 1 } }}>
            <PlayerPanels view={view} />
          </Box>
          <Stack spacing={2} sx={{ minWidth: 0, order: { xs: 1, lg: 2 } }}>
            <Paper component="section" elevation={4} sx={{ overflow: 'hidden', p: { xs: 0.5, sm: 1.5 } }}>
              <PlayableGameBoard
                legalEdgeIds={busy ? [] : legalEdgeIds}
                legalTileIds={busy ? [] : view.legalActions.legalRobberTileIds}
                legalVertexIds={busy ? [] : legalVertexIds}
                onEdgeSelect={(edgeId) => sendBoardCommand(commandForEdgeSelection(view, edgeId))}
                onTileSelect={(tileId) => sendBoardCommand(commandForTileSelection(view, tileId))}
                onVertexSelect={(vertexId) => sendBoardCommand(commandForVertexSelection(view, vertexId, buildMode))}
                view={view}
              />
            </Paper>
            <ResourceHand view={view} />
            <DevelopmentCardHand
              busy={busy}
              onPlay={(cardId) => onCommand({ type: 'PLAY_DEVELOPMENT_CARD', cardId })}
              view={view}
            />
          </Stack>
          <Stack spacing={2} sx={{ minWidth: 0, order: 3 }}>
            <BankSupplyPanel view={view} />
            <ActionPanel
              buildMode={buildMode}
              busy={busy}
              onBuildModeChange={onBuildModeChange}
              onCommand={onCommand}
              onOpenDomesticTrade={() => setDomesticTradeId(createTradeId())}
              onOpenMaritimeTrade={() => setMaritimeOpen(true)}
              view={view}
            />
            <Paper aria-label="Game log" component="section" elevation={0} sx={{ maxHeight: 280, overflowY: 'auto', p: 2 }}>
              <Typography component="h2" gutterBottom sx={{ fontWeight: 800 }} variant="h6">Game log</Typography>
              {events.length === 0 ? (
                <Typography color="text.secondary" variant="body2">The voyage is just beginning.</Typography>
              ) : (
                <Stack component="ol" spacing={1} sx={{ m: 0, pl: 2.5 }}>
                  {[...events].slice(-30).reverse().map((event, index) => (
                    <Typography component="li" key={`${view.stateVersion}:${index}:${event.type}`} variant="body2">
                      {formatEvent(event, view)}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Paper>
          </Stack>
        </Box>
      </Container>

      <DiscardDecisionDialog busy={busy} onSubmit={(resources) => onCommand({ type: 'DISCARD_RESOURCES', resources })} view={view} />
      <InventionDecisionDialog busy={busy} onSubmit={(resources) => onCommand({ type: 'CHOOSE_INVENTION_RESOURCES', resources })} view={view} />
      <MonopolyDecisionDialog busy={busy} onSubmit={(resource) => onCommand({ type: 'CHOOSE_MONOPOLY_RESOURCE', resource })} view={view} />
      <RobberTargetDialog busy={busy} onSubmit={(targetPlayerId) => onCommand({ type: 'STEAL_FROM_PLAYER', targetPlayerId })} view={view} />
      <MaritimeTradeDialog
        busy={busy}
        onClose={() => setMaritimeOpen(false)}
        onSubmit={(giveResource: ResourceType, receiveResource: ResourceType) => {
          onCommand({ type: 'MARITIME_TRADE', giveResource, receiveResource })
          setMaritimeOpen(false)
        }}
        open={maritimeOpen}
        view={view}
      />
      {domesticTradeId === null ? null : (
        <DomesticTradeDialog
          busy={busy}
          onClose={() => setDomesticTradeId(null)}
          onSubmit={submitTrade}
          open
          tradeId={domesticTradeId}
          view={view}
        />
      )}
      {counterTradeId === null || pendingTrade === undefined ? null : (
        <DomesticTradeDialog
          busy={busy}
          onClose={() => setCounterTradeId(null)}
          onSubmit={submitTrade}
          open
          previousOffer={pendingTrade}
          tradeId={counterTradeId}
          view={view}
        />
      )}
      <TradeResponseDialog
        busy={busy}
        counterDialogOpen={counterTradeId !== null}
        onAccept={() => pendingTrade === undefined ? undefined : onCommand({ type: 'ACCEPT_TRADE', tradeId: pendingTrade.tradeId })}
        onCounter={() => setCounterTradeId(createTradeId())}
        onReject={() => pendingTrade === undefined ? undefined : onCommand({ type: 'REJECT_TRADE', tradeId: pendingTrade.tradeId })}
        view={view}
      />
      <VictoryDialog onNewGame={onNewGame} view={view} />
    </Box>
  )
}
