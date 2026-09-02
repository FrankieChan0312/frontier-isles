import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { PlayerId, TradeId } from '../../game/model/ids.ts'
import { RESOURCE_TYPES, type ResourceBag, type ResourceType } from '../../game/model/resource.ts'
import type { TradeOffer } from '../../game/model/trade.ts'
import {
  emptyResourceBag,
  formatResourceBag,
  RESOURCE_LABELS,
  resourceBagTotal,
} from '../game/ui-format.ts'

interface ResourceBagEditorProps {
  readonly label: string
  readonly value: ResourceBag
  readonly maximum?: ResourceBag
  readonly onChange: (value: ResourceBag) => void
}

function ResourceBagEditor({ label, value, maximum, onChange }: ResourceBagEditorProps): React.JSX.Element {
  return (
    <Stack aria-label={label} component="fieldset" spacing={1} sx={{ border: 0, m: 0, p: 0 }}>
      <Typography component="legend" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {RESOURCE_TYPES.map((resource) => (
          <TextField
            key={resource}
            slotProps={{ htmlInput: {
              'aria-label': `${label} ${RESOURCE_LABELS[resource]}`,
              max: maximum?.[resource],
              min: 0,
            } }}
            label={RESOURCE_LABELS[resource]}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              const bounded = Number.isFinite(parsed)
                ? Math.max(0, Math.min(maximum?.[resource] ?? 19, Math.floor(parsed)))
                : 0
              onChange({ ...value, [resource]: bounded })
            }}
            size="small"
            type="number"
            value={value[resource]}
          />
        ))}
      </Stack>
    </Stack>
  )
}

export interface DiscardDecisionDialogProps {
  readonly view: PlayerView
  readonly busy: boolean
  readonly onSubmit: (resources: ResourceBag) => void
}

export function DiscardDecisionDialog({ view, busy, onSubmit }: DiscardDecisionDialogProps): React.JSX.Element | null {
  const pending = view.pendingDecision
  const [resources, setResources] = useState<ResourceBag>(emptyResourceBag)
  const required = pending?.type === 'DISCARD_RESOURCES' ? pending.requiredCount : 0
  if (pending?.type !== 'DISCARD_RESOURCES') return null
  const total = resourceBagTotal(resources)
  return (
    <Dialog aria-labelledby="discard-title" fullWidth maxWidth="md" open>
      <DialogTitle id="discard-title">Discard {required} resources</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>A seven was rolled. Choose exactly {required} cards from your hand.</Typography>
        <ResourceBagEditor label="Resources to discard" maximum={view.self.resources} onChange={setResources} value={resources} />
        {total === required ? null : <Alert severity="info" sx={{ mt: 2 }}>Selected {total} of {required}.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || total !== required} onClick={() => onSubmit(resources)} variant="contained">Discard selected</Button>
      </DialogActions>
    </Dialog>
  )
}

export interface InventionDecisionDialogProps {
  readonly view: PlayerView
  readonly busy: boolean
  readonly onSubmit: (resources: ResourceBag) => void
}

export function InventionDecisionDialog({ view, busy, onSubmit }: InventionDecisionDialogProps): React.JSX.Element | null {
  if (view.pendingDecision?.type !== 'CHOOSE_INVENTION_RESOURCES') return null
  const selections = view.legalActions.legalInventionSelections ?? []
  return (
    <Dialog aria-labelledby="invention-title" fullWidth maxWidth="sm" open>
      <DialogTitle id="invention-title">Choose invention resources</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Choose one legal pair available from the bank.</Typography>
        <Stack spacing={1}>
          {selections.map((selection) => (
            <Button
              key={RESOURCE_TYPES.map((resource) => selection[resource]).join('-')}
              disabled={busy}
              onClick={() => onSubmit(selection)}
              variant="outlined"
            >{formatResourceBag(selection)}</Button>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}

export interface MonopolyDecisionDialogProps {
  readonly view: PlayerView
  readonly busy: boolean
  readonly onSubmit: (resource: ResourceType) => void
}

export function MonopolyDecisionDialog({ view, busy, onSubmit }: MonopolyDecisionDialogProps): React.JSX.Element | null {
  if (view.pendingDecision?.type !== 'CHOOSE_MONOPOLY_RESOURCE') return null
  return (
    <Dialog aria-labelledby="monopoly-title" fullWidth maxWidth="xs" open>
      <DialogTitle id="monopoly-title">Choose monopoly resource</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {(view.legalActions.legalMonopolyResourceTypes ?? []).map((resource) => (
            <Button key={resource} disabled={busy} onClick={() => onSubmit(resource)} variant="outlined">
              {RESOURCE_LABELS[resource]}
            </Button>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}

export interface RobberTargetDialogProps {
  readonly view: PlayerView
  readonly busy: boolean
  readonly onSubmit: (playerId: PlayerId) => void
}

export function RobberTargetDialog({ view, busy, onSubmit }: RobberTargetDialogProps): React.JSX.Element | null {
  if (view.pendingDecision?.type !== 'CHOOSE_ROBBER_TARGET') return null
  return (
    <Dialog aria-labelledby="robber-target-title" fullWidth maxWidth="xs" open>
      <DialogTitle id="robber-target-title">Choose a player to steal from</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {view.legalActions.eligibleRobberTargetPlayerIds.map((playerId) => {
            const player = view.opponents.find((candidate) => candidate.id === playerId)
            return (
              <Button key={playerId} disabled={busy} onClick={() => onSubmit(playerId)} variant="outlined">
                {player?.name ?? 'Unknown player'} · {player?.resourceCardCount ?? 0} cards
              </Button>
            )
          })}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}

export interface MaritimeTradeDialogProps {
  readonly open: boolean
  readonly view: PlayerView
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSubmit: (giveResource: ResourceType, receiveResource: ResourceType) => void
}

export function MaritimeTradeDialog({ open, view, busy, onClose, onSubmit }: MaritimeTradeDialogProps): React.JSX.Element {
  return (
    <Dialog aria-labelledby="maritime-title" fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle id="maritime-title">Maritime trade</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Choose one engine-approved exchange.</Typography>
        <Stack spacing={1}>
          {view.legalActions.legalMaritimeTradeOptions.map((option) => (
            <Button
              key={`${option.giveResource}:${option.receiveResource}:${option.ratio}`}
              disabled={busy}
              onClick={() => onSubmit(option.giveResource, option.receiveResource)}
              variant="outlined"
            >Give {option.ratio} {RESOURCE_LABELS[option.giveResource]} · receive 1 {RESOURCE_LABELS[option.receiveResource]}</Button>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button></DialogActions>
    </Dialog>
  )
}

export interface DomesticTradeDialogProps {
  readonly open: boolean
  readonly view: PlayerView
  readonly tradeId: TradeId
  readonly previousOffer?: TradeOffer
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSubmit: (offer: TradeOffer) => void
}

export function DomesticTradeDialog({
  open,
  view,
  tradeId,
  previousOffer,
  busy,
  onClose,
  onSubmit,
}: DomesticTradeDialogProps): React.JSX.Element {
  const counterparties = view.legalActions.legalDomesticTradeCounterpartyIds ?? []
  const [counterpartyId, setCounterpartyId] = useState<PlayerId | ''>(
    previousOffer?.counterpartyId ?? counterparties[0] ?? '',
  )
  const [initiatorGives, setInitiatorGives] = useState<ResourceBag>(
    previousOffer?.initiatorGives ?? emptyResourceBag,
  )
  const [counterpartyGives, setCounterpartyGives] = useState<ResourceBag>(
    previousOffer?.counterpartyGives ?? emptyResourceBag,
  )

  const initiatorId = previousOffer?.initiatorId ?? view.self.id
  const resolvedCounterpartyId = previousOffer?.counterpartyId ?? counterpartyId
  const selfIsInitiator = view.self.id === initiatorId
  const selfOutgoing = selfIsInitiator ? initiatorGives : counterpartyGives
  const canSubmit = resolvedCounterpartyId !== ''
    && resourceBagTotal(initiatorGives) > 0
    && resourceBagTotal(counterpartyGives) > 0
    && RESOURCE_TYPES.every((resource) => selfOutgoing[resource] <= view.self.resources[resource])
  const selectedName = view.opponents.find((player) => player.id === resolvedCounterpartyId)?.name ?? 'AI player'

  return (
    <Dialog aria-labelledby="domestic-trade-title" fullWidth maxWidth="md" onClose={onClose} open={open}>
      <DialogTitle id="domestic-trade-title">{previousOffer === undefined ? 'Propose domestic trade' : 'Counter trade'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {previousOffer === undefined ? (
            <FormControl fullWidth>
              <InputLabel id="trade-player-label">Trade with</InputLabel>
              <Select
                label="Trade with"
                labelId="trade-player-label"
                onChange={(event) => setCounterpartyId(event.target.value as PlayerId)}
                value={counterpartyId}
              >
                {counterparties.map((playerId) => (
                  <MenuItem key={playerId} value={playerId}>
                    {view.opponents.find((player) => player.id === playerId)?.name ?? 'AI player'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : <Typography>Revise the terms with {selectedName}.</Typography>}
          <ResourceBagEditor
            label={`${view.self.name} gives`}
            {...(selfIsInitiator ? { maximum: view.self.resources } : {})}
            onChange={selfIsInitiator ? setInitiatorGives : setCounterpartyGives}
            value={selfIsInitiator ? initiatorGives : counterpartyGives}
          />
          <ResourceBagEditor
            label={`${selectedName} gives`}
            {...(selfIsInitiator ? {} : { maximum: view.self.resources })}
            onChange={selfIsInitiator ? setCounterpartyGives : setInitiatorGives}
            value={selfIsInitiator ? counterpartyGives : initiatorGives}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={busy || !canSubmit}
          onClick={() => {
            if (resolvedCounterpartyId === '') return
            onSubmit({
              tradeId,
              initiatorId,
              counterpartyId: resolvedCounterpartyId,
              proposedById: view.self.id,
              initiatorGives,
              counterpartyGives,
              parentTradeId: previousOffer?.tradeId ?? null,
            })
          }}
          variant="contained"
        >{previousOffer === undefined ? 'Send offer' : 'Send counter'}</Button>
      </DialogActions>
    </Dialog>
  )
}

export interface TradeResponseDialogProps {
  readonly view: PlayerView
  readonly busy: boolean
  readonly counterDialogOpen: boolean
  readonly onAccept: () => void
  readonly onReject: () => void
  readonly onCounter: () => void
}

export function TradeResponseDialog({ view, busy, counterDialogOpen, onAccept, onReject, onCounter }: TradeResponseDialogProps): React.JSX.Element | null {
  const pending = view.pendingDecision
  if (pending?.type !== 'RESPOND_TO_TRADE' || counterDialogOpen) return null
  const offer = pending.offer
  const selfIsInitiator = view.self.id === offer.initiatorId
  const selfGives = selfIsInitiator ? offer.initiatorGives : offer.counterpartyGives
  const selfReceives = selfIsInitiator ? offer.counterpartyGives : offer.initiatorGives
  const otherId = selfIsInitiator ? offer.counterpartyId : offer.initiatorId
  const otherName = view.opponents.find((player) => player.id === otherId)?.name ?? 'AI player'
  const response = view.legalActions.tradeResponse
  return (
    <Dialog aria-labelledby="trade-response-title" fullWidth maxWidth="sm" open>
      <DialogTitle id="trade-response-title">Trade offer from {otherName}</DialogTitle>
      <DialogContent>
        <Typography>You give: {formatResourceBag(selfGives)}</Typography>
        <Typography>You receive: {formatResourceBag(selfReceives)}</Typography>
      </DialogContent>
      <DialogActions>
        <Button color="error" disabled={busy || response?.canReject !== true} onClick={onReject}>Reject</Button>
        {response?.canCounter === true ? <Button disabled={busy} onClick={onCounter}>Counter</Button> : null}
        <Button disabled={busy || response?.canAccept !== true} onClick={onAccept} variant="contained">Accept</Button>
      </DialogActions>
    </Dialog>
  )
}

export interface VictoryDialogProps {
  readonly view: PlayerView
  readonly onNewGame: () => void
}

export function VictoryDialog({ view, onNewGame }: VictoryDialogProps): React.JSX.Element | null {
  const winnerId = view.publicGame.winnerId
  if (winnerId === null) return null
  const winnerName = winnerId === view.self.id
    ? view.self.name
    : view.opponents.find((player) => player.id === winnerId)?.name ?? 'A player'
  return (
    <Dialog aria-labelledby="victory-title" fullWidth maxWidth="xs" open>
      <DialogTitle id="victory-title">{winnerId === view.self.id ? 'Victory!' : 'Game complete'}</DialogTitle>
      <DialogContent><Typography>{winnerName} reached ten points and won Frontier Isles.</Typography></DialogContent>
      <DialogActions><Button onClick={onNewGame} variant="contained">Start a new game</Button></DialogActions>
    </Dialog>
  )
}
