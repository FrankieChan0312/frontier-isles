import type {
  DevelopmentCardDefinition,
  DevelopmentCardType,
} from './development-card.ts'
import type { DevelopmentCardId } from './ids.ts'

function createCard(
  type: DevelopmentCardType,
  slug: string,
  sequence: number,
): DevelopmentCardDefinition {
  const suffix = String(sequence).padStart(2, '0')
  return Object.freeze({
    id: `development-card:${slug}:${suffix}` as DevelopmentCardId,
    type,
  })
}

function createCards(
  type: DevelopmentCardType,
  slug: string,
  count: number,
): readonly DevelopmentCardDefinition[] {
  return Array.from({ length: count }, (_, index) => createCard(type, slug, index + 1))
}

export const STANDARD_DEVELOPMENT_DECK_SOURCE: readonly DevelopmentCardDefinition[] =
  Object.freeze([
    ...createCards('KNIGHT', 'knight', 14),
    ...createCards('VICTORY_POINT', 'victory-point', 5),
    ...createCards('ROAD_BUILDING', 'road-building', 2),
    ...createCards('MONOPOLY', 'monopoly', 2),
    ...createCards('INVENTION', 'invention', 2),
  ])
