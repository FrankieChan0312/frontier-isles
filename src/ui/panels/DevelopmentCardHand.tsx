import {
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type {
  DevelopmentCardPlayabilityReason,
  PlayerView,
} from '@frontier-isles/game-core/contracts/views'
import type { DevelopmentCardId } from '@frontier-isles/game-core/model/ids'
import {
  DEVELOPMENT_CARD_DESCRIPTIONS,
  DEVELOPMENT_CARD_LABELS,
  developmentCardDisplayStatus,
} from '../game/ui-format.ts'

function disabledReason(reason: DevelopmentCardPlayabilityReason): string | null {
  switch (reason) {
    case 'PLAYABLE':
      return null
    case 'BOUGHT_THIS_TURN':
      return 'Bought this turn; action cards become playable on a later turn.'
    case 'ALREADY_PLAYED':
      return 'This card has already been played.'
    case 'VICTORY_POINT':
      return 'Victory Point cards reveal automatically when required to win.'
    case 'NOT_YOUR_TURN':
      return 'Wait for your turn.'
    case 'PENDING_DECISION':
      return 'Resolve the current decision first.'
    case 'WRONG_PHASE':
      return 'Play action cards before rolling or during your Action phase.'
    case 'CARD_LIMIT_REACHED':
      return 'You already played a development card this turn.'
    case 'EFFECT_UNAVAILABLE':
      return 'This effect has no legal choice right now.'
    case 'GAME_OVER':
      return 'The game is complete.'
  }
}

export interface DevelopmentCardHandProps {
  readonly view: PlayerView
  readonly busy: boolean
  readonly onPlay: (cardId: DevelopmentCardId) => void
}

export function DevelopmentCardHand({
  view,
  busy,
  onPlay,
}: DevelopmentCardHandProps): React.JSX.Element {
  const projected = view.legalActions.developmentCardPlayability ?? []
  return (
    <Paper aria-labelledby="development-cards-title" component="section" elevation={0} sx={{ p: 1.5 }}>
      <Typography component="h2" id="development-cards-title" sx={{ fontWeight: 700 }} variant="h6">
        Development Cards
      </Typography>
      {view.self.developmentCards.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
          You do not own any Development Cards yet.
        </Typography>
      ) : (
        <Stack spacing={1.25} sx={{ mt: 1.25 }}>
          {view.self.developmentCards.map((card) => {
            const name = DEVELOPMENT_CARD_LABELS[card.type]
            const status = developmentCardDisplayStatus(card, view.publicGame.turn.turnNumber)
            const action = projected.find((candidate) => candidate.cardId === card.id)
            const canPlay = action?.canPlay
              ?? view.legalActions.playableDevelopmentCardIds.includes(card.id)
            const reason = disabledReason(action?.reason ?? (canPlay ? 'PLAYABLE' : 'EFFECT_UNAVAILABLE'))
            const reasonId = `development-card-reason-${card.id.replaceAll(':', '-')}`
            return (
              <Card
                key={card.id}
                aria-label={`${name} Development Card, ${status}`}
                component="article"
                variant="outlined"
              >
                <CardContent sx={{ pb: card.type === 'VICTORY_POINT' ? 2 : 0.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography component="h3" sx={{ fontWeight: 800 }} variant="subtitle1">{name}</Typography>
                    <Chip label={status} size="small" variant="outlined" />
                  </Stack>
                  <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
                    {DEVELOPMENT_CARD_DESCRIPTIONS[card.type]}
                  </Typography>
                  {card.type === 'VICTORY_POINT' || reason === null ? null : (
                    <Typography color="text.secondary" id={reasonId} sx={{ mt: 0.75 }} variant="caption">
                      Cannot play: {reason}
                    </Typography>
                  )}
                </CardContent>
                {card.type === 'VICTORY_POINT' ? null : (
                  <CardActions>
                    <Button
                      aria-describedby={reason === null ? undefined : reasonId}
                      aria-label={reason === null ? `Play ${name}` : `Play ${name}. Unavailable: ${reason}`}
                      disabled={busy || !canPlay}
                      onClick={() => onPlay(card.id)}
                      variant="outlined"
                    >Play {name}</Button>
                  </CardActions>
                )}
              </Card>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}
