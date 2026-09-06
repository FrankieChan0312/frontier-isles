import { z } from 'zod'
import { REALTIME_PROTOCOL_VERSION } from './protocol-version.js'
import { gameIdSchema } from './game-values.js'
import {
  aiProfileIdSchema,
  CANONICAL_SEAT_IDS,
  connectionStatusSchema,
  displayNameSchema,
  roomCodeSchema,
  roomLifecycleStatusSchema,
  roomRevisionSchema,
  seatIdSchema,
  startReadinessBlockerCodeSchema,
  type RoomLifecycleStatus,
  type StartReadinessBlockerCode,
} from './domains.js'

export const emptySeatSnapshotSchema = z.strictObject({
  seatId: seatIdSchema,
  occupancy: z.literal('EMPTY'),
})

export const humanSeatSnapshotSchema = z.strictObject({
  seatId: seatIdSchema,
  occupancy: z.literal('HUMAN'),
  displayName: displayNameSchema,
  ready: z.boolean(),
  connectionStatus: connectionStatusSchema,
})

export const aiSeatSnapshotSchema = z.strictObject({
  seatId: seatIdSchema,
  occupancy: z.literal('AI'),
  profileId: aiProfileIdSchema,
  ready: z.literal(true),
  connectionStatus: z.literal('CONNECTED'),
})

export const seatSnapshotSchema = z.discriminatedUnion('occupancy', [
  emptySeatSnapshotSchema,
  humanSeatSnapshotSchema,
  aiSeatSnapshotSchema,
])

export type EmptySeatSnapshot = Readonly<z.infer<typeof emptySeatSnapshotSchema>>
export type HumanSeatSnapshot = Readonly<z.infer<typeof humanSeatSnapshotSchema>>
export type AiSeatSnapshot = Readonly<z.infer<typeof aiSeatSnapshotSchema>>
export type SeatSnapshot = Readonly<z.infer<typeof seatSnapshotSchema>>

export const roomSeatsSchema = z.tuple([
  seatSnapshotSchema,
  seatSnapshotSchema,
  seatSnapshotSchema,
  seatSnapshotSchema,
]).superRefine((seats, context) => {
  for (const [index, seatId] of CANONICAL_SEAT_IDS.entries()) {
    const seat = seats[index]
    if (seat === undefined || seat.seatId !== seatId) {
      context.addIssue({
        code: 'custom',
        message: 'Seats must use canonical order.',
        path: [index, 'seatId'],
      })
    }
  }
})

export type RoomSeats = Readonly<z.infer<typeof roomSeatsSchema>>

export const startReadinessSchema = z.strictObject({
  ready: z.boolean(),
  blockers: z.array(startReadinessBlockerCodeSchema).max(5),
}).superRefine((readiness, context) => {
  if (new Set(readiness.blockers).size !== readiness.blockers.length) {
    context.addIssue({ code: 'custom', message: 'Start blockers must be unique.', path: ['blockers'] })
  }
  if (readiness.ready !== (readiness.blockers.length === 0)) {
    context.addIssue({ code: 'custom', message: 'Start readiness does not match its blockers.' })
  }
})

export interface StartReadiness {
  readonly ready: boolean
  readonly blockers: readonly StartReadinessBlockerCode[]
}

export function deriveStartReadiness(
  seats: readonly SeatSnapshot[],
  lifecycleStatus: RoomLifecycleStatus = 'WAITING',
): StartReadiness {
  const humans = seats.filter((seat): seat is HumanSeatSnapshot => seat.occupancy === 'HUMAN')
  const blockers: StartReadinessBlockerCode[] = []

  if (lifecycleStatus !== 'WAITING') blockers.push('ROOM_NOT_WAITING')
  if (seats.some((seat) => seat.occupancy === 'EMPTY')) blockers.push('SEATS_NOT_FULL')
  if (humans.length < 2) blockers.push('NOT_ENOUGH_HUMANS')
  if (humans.some((seat) => seat.connectionStatus !== 'CONNECTED')) {
    blockers.push('HUMANS_NOT_CONNECTED')
  }
  if (humans.some((seat) => !seat.ready)) blockers.push('HUMANS_NOT_READY')

  return Object.freeze({
    ready: blockers.length === 0,
    blockers: Object.freeze([...blockers]),
  })
}

export const roomSnapshotSchema = z.strictObject({
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  roomCode: roomCodeSchema,
  revision: roomRevisionSchema,
  lifecycleStatus: roomLifecycleStatusSchema,
  gameId: gameIdSchema.optional(),
  hostSeatId: seatIdSchema,
  seats: roomSeatsSchema,
  startReadiness: startReadinessSchema,
}).superRefine((snapshot, context) => {
  if ((snapshot.lifecycleStatus === 'ACTIVE' || snapshot.lifecycleStatus === 'FINISHED')
    !== (snapshot.gameId !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Started Rooms must identify their game.' })
  }
  const expected = deriveStartReadiness(snapshot.seats, snapshot.lifecycleStatus)
  if (
    snapshot.startReadiness.ready !== expected.ready
    || snapshot.startReadiness.blockers.length !== expected.blockers.length
    || snapshot.startReadiness.blockers.some((blocker, index) => blocker !== expected.blockers[index])
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Start readiness must be derived from the public seats.',
      path: ['startReadiness'],
    })
  }

  const host = snapshot.seats.find((seat) => seat.seatId === snapshot.hostSeatId)
  if (host?.occupancy !== 'HUMAN') {
    context.addIssue({
      code: 'custom',
      message: 'The Host seat must be occupied by a Human.',
      path: ['hostSeatId'],
    })
  }
})

export type RoomSnapshot = Readonly<z.infer<typeof roomSnapshotSchema>>
