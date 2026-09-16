import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import { RESOURCE_TYPES } from '@frontier-isles/game-core/model/resource'
import { RESOURCE_LABELS } from '../game/ui-format.ts'

export interface BankSupplyPanelProps {
  readonly view: PlayerView
}

export function BankSupplyPanel({ view }: BankSupplyPanelProps): React.JSX.Element {
  const bank = view.publicGame.bank
  return (
    <Paper aria-labelledby="bank-supply-title" component="section" elevation={3} sx={{ p: 2 }}>
      <Typography component="h2" id="bank-supply-title" sx={{ fontWeight: 800 }} variant="h6">
        Bank / Supply
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1.5 }} variant="body2">
        Public cards currently available for production, trades, and purchases.
      </Typography>
      <Stack component="dl" spacing={0} sx={{ m: 0, '& > div + div': { borderTop: 1, borderColor: 'divider' } }}>
        {RESOURCE_TYPES.map((resource) => (
          <Stack
            component="div"
            direction="row"
            key={resource}
            sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0, py: 0.75 }}
          >
            <Typography component="dt" sx={{ overflowWrap: 'anywhere' }} variant="body2">
              {RESOURCE_LABELS[resource]}
            </Typography>
            <Box component="dd" sx={{ m: 0 }}><Chip
              aria-label={`${RESOURCE_LABELS[resource]} remaining: ${bank.resources[resource]}`}
              label={bank.resources[resource]}
              size="small"
              variant="outlined"
            /></Box>
          </Stack>
        ))}
        <Stack
          component="div"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0, py: 0.75 }}
        >
          <Typography component="dt" sx={{ overflowWrap: 'anywhere' }} variant="body2">
            Development Cards
          </Typography>
          <Box component="dd" sx={{ m: 0 }}><Chip
            aria-label={`Development Cards remaining: ${bank.developmentDeckCount}`}
            label={bank.developmentDeckCount}
            size="small"
            variant="outlined"
          /></Box>
        </Stack>
      </Stack>
    </Paper>
  )
}
