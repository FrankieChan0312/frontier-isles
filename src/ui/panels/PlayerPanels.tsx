import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { PlayerView, PublicPlayerState } from '../../game/contracts/views.ts'
import type { PlayerColor } from '../../game/model/player.ts'

const PLAYER_COLORS: Readonly<Record<PlayerColor, string>> = {
  RED: '#c4473d',
  BLUE: '#3575ad',
  ORANGE: '#d77b2f',
  WHITE: '#f5f2e8',
}

interface PublicPlayerCardProps {
  readonly player: PublicPlayerState
  readonly current: boolean
  readonly longestRoad: boolean
  readonly largestArmy: boolean
}

function PublicPlayerCard({ player, current, longestRoad, largestArmy }: PublicPlayerCardProps): React.JSX.Element {
  return (
    <Paper
      aria-current={current ? 'true' : undefined}
      elevation={current ? 4 : 0}
      sx={{
        borderColor: current ? 'primary.main' : 'divider',
        borderLeft: `8px solid ${PLAYER_COLORS[player.color]}`,
        p: 1.5,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>{player.name}</Typography>
          <Typography color="text.secondary" variant="caption">
            {player.controller.type === 'HUMAN' ? 'You' : player.controller.profileId}
          </Typography>
        </Box>
        <Typography aria-label={`${player.publicVictoryPoints} public points`} sx={{ fontWeight: 800 }} variant="h6">
          {player.publicVictoryPoints} VP
        </Typography>
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
        <Chip label={`${player.resourceCardCount} resources`} size="small" />
        <Chip label={`${player.developmentCardCount} development`} size="small" />
        <Chip label={`${player.playedKnights} guards`} size="small" />
        {longestRoad ? <Chip color="secondary" label="Longest route" size="small" /> : null}
        {largestArmy ? <Chip color="secondary" label="Largest guard" size="small" /> : null}
      </Stack>
    </Paper>
  )
}

export function PlayerPanels({ view }: { readonly view: PlayerView }): React.JSX.Element {
  const players: PublicPlayerState[] = [
    {
      ...view.self,
      resourceCardCount: Object.values(view.self.resources).reduce((sum, count) => sum + count, 0),
      developmentCardCount: view.self.developmentCards.length,
    },
    ...view.opponents,
  ]
  return (
    <Stack aria-label="Players" component="section" spacing={1}>
      {players.map((player) => (
        <PublicPlayerCard
          key={player.id}
          current={view.publicGame.turn.currentPlayerId === player.id}
          largestArmy={view.publicGame.awards.largestArmyHolderId === player.id}
          longestRoad={view.publicGame.awards.longestRoadHolderId === player.id}
          player={player}
        />
      ))}
    </Stack>
  )
}
