import { Chip, Paper, Stack, Typography } from '@mui/material'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import { RESOURCE_TYPES } from '@frontier-isles/game-core/model/resource'
import { RESOURCE_LABELS, RESOURCE_SYMBOLS } from '../game/ui-format.ts'

export function ResourceHand({ view }: { readonly view: PlayerView }): React.JSX.Element {
  return (
    <Paper component="section" elevation={0} sx={{ p: 1.5 }}>
      <Typography gutterBottom sx={{ fontWeight: 700 }}>Your hand</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {RESOURCE_TYPES.map((resource) => (
          <Chip
            key={resource}
            aria-label={`${RESOURCE_LABELS[resource]}: ${view.self.resources[resource]}`}
            label={`${RESOURCE_SYMBOLS[resource]} ${view.self.resources[resource]}`}
            variant="outlined"
          />
        ))}
      </Stack>
      <Typography color="text.secondary" sx={{ mt: 1.5 }} variant="caption">
        Hidden points are included in your private total: {view.self.actualVictoryPoints} VP
      </Typography>
    </Paper>
  )
}
