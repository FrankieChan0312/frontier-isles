import { useStore } from 'zustand'
import { Alert, Button, Container, LinearProgress, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { CommandId, TradeId } from '@frontier-isles/game-core/model/ids'
import type { GameGateway } from '../application/gateways/game-gateway.ts'
import type {
  LobbyGateway,
  LobbyGatewayState,
} from '../application/gateways/lobby-gateway.ts'
import { createGameSessionStore } from '../application/stores/game-session-store.ts'
import { createUiInteractionStore } from '../application/stores/ui-interaction-store.ts'
import { HomePage } from '../ui/pages/HomePage.tsx'
import { LobbyPage } from '../ui/pages/LobbyPage.tsx'
import { GamePage } from '../ui/pages/GamePage.tsx'
import { GamePresencePanel } from '../ui/panels/GamePresencePanel.tsx'
import { formatRuleViolation } from '../ui/game/ui-format.ts'
import {
  createBrowserGameConfig,
  createBrowserSeed,
  type SeedFactory,
} from './browser-game.ts'
import { createBrowserGateway, createBrowserLobbyGateway } from './browser-runtime.ts'

export interface AppProps {
  readonly gateway?: GameGateway
  readonly lobbyGateway?: LobbyGateway
  readonly seedFactory?: SeedFactory
}

interface ActiveGameSetup {
  readonly humanName: string
  readonly seed: string
}

type AppScreen = 'HOME' | 'GAME' | 'LOBBY'

const INITIAL_LOBBY_STATE: LobbyGatewayState = Object.freeze({
  connectionState: 'DISCONNECTED',
  error: null,
  selfSeatId: null,
  snapshot: null,
})

export function App({
  gateway: providedGateway,
  lobbyGateway: providedLobbyGateway,
  seedFactory = createBrowserSeed,
}: AppProps): React.JSX.Element {
  const localGateway = useMemo(() => providedGateway ?? createBrowserGateway(), [providedGateway])
  const lobbyGateway = useMemo(
    () => providedLobbyGateway ?? createBrowserLobbyGateway(),
    [providedLobbyGateway],
  )
  const localSessionStore = useMemo(() => createGameSessionStore(), [])
  const onlineSessionStore = useMemo(() => createGameSessionStore(), [])
  const [mode, setMode] = useState<'LOCAL' | 'ONLINE'>('LOCAL')
  const sessionStore = mode === 'ONLINE' ? onlineSessionStore : localSessionStore
  const onlineGateway = lobbyGateway.gameGateway
  const gateway = mode === 'ONLINE' ? onlineGateway : localGateway
  const uiStore = useMemo(() => createUiInteractionStore(), [])
  const session = useStore(sessionStore)
  const ui = useStore(uiStore)
  const [screen, setScreen] = useState<AppScreen>('HOME')
  const [humanName, setHumanName] = useState('Explorer')
  const [seed, setSeed] = useState(() => seedFactory())
  const [onlineRoomCode, setOnlineRoomCode] = useState('')
  const [lobby, setLobby] = useState<LobbyGatewayState>(INITIAL_LOBBY_STATE)
  const [activeSetup, setActiveSetup] = useState<ActiveGameSetup | null>(null)
  const [hasSavedGame, setHasSavedGame] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const commandCounter = useRef(0)
  const tradeCounter = useRef(0)

  useEffect(() => localGateway.subscribe(localSessionStore.getState().applyGatewayUpdate), [localGateway, localSessionStore])
  useEffect(() => onlineGateway?.subscribe(onlineSessionStore.getState().applyGatewayUpdate), [onlineGateway, onlineSessionStore])
  useEffect(() => lobbyGateway.subscribe((state) => {
    setLobby(state)
    if (onlineGateway !== undefined && state.snapshot?.gameId !== undefined) {
      setMode('ONLINE')
      setScreen('GAME')
      setActiveSetup(null)
    }
  }), [lobbyGateway, onlineGateway])
  useEffect(() => {
    let active = true
    void lobbyGateway.resumeSession().then((resumed) => {
      if (active && resumed) {
        setMode('ONLINE')
        setScreen((current) => current === 'GAME' ? 'GAME' : 'LOBBY')
      }
    }).catch((error: unknown) => {
      if (active) setLocalError(error instanceof Error ? error.message : String(error))
    })
    return () => { active = false }
  }, [lobbyGateway])
  useEffect(() => {
    let active = true
    void localGateway.hasSavedGame().then((available) => {
      if (active) setHasSavedGame(available)
    }).catch(() => {
      if (active) setHasSavedGame(false)
    })
    return () => { active = false }
  }, [localGateway])

  const run = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setLocalError(null)
    try {
      await operation()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  const startGame = useCallback((setup: ActiveGameSetup): void => {
    void run(async () => {
      const normalized = { humanName: setup.humanName.trim() || 'Explorer', seed: setup.seed.trim() }
      await localGateway.createGame(createBrowserGameConfig(normalized.humanName, normalized.seed), normalized.seed)
      setMode('LOCAL')
      setActiveSetup(normalized)
      setHasSavedGame(true)
      setScreen('GAME')
      uiStore.getState().reset()
    })
  }, [localGateway, run, uiStore])

  const submitCommand = useCallback((command: GameCommand): void => {
    const view = sessionStore.getState().view
    if (view === null) return
    if (gateway === undefined) { setLocalError('The online game connection is unavailable.'); return }
    const commandNumber = commandCounter.current
    commandCounter.current += 1
    void run(async () => {
      const response = await gateway.submit({
        commandId: `command:ui:${view.stateVersion}:${commandNumber}` as CommandId,
        actorId: view.self.id,
        expectedStateVersion: view.stateVersion,
        command,
      })
      if (!response.ok) {
        setLocalError(formatRuleViolation(response.violation.code))
        return
      }
      uiStore.getState().setSelectedBuildMode(null)
      if (mode === 'LOCAL') setHasSavedGame(true)
    })
  }, [gateway, mode, run, sessionStore, uiStore])

  const createTradeId = useCallback((): TradeId => {
    const stateVersion = sessionStore.getState().view?.stateVersion ?? 0
    const tradeNumber = tradeCounter.current
    tradeCounter.current += 1
    return `trade:ui:${stateVersion}:${tradeNumber}` as TradeId
  }, [sessionStore])

  const effectiveError = localError ?? lobby.error?.message ?? session.error
  const onlinePaused = mode === 'ONLINE' && (session.connectionStatus !== 'READY'
    || session.presence?.lifecycleStatus === 'PAUSED_RECONNECTING'
    || session.presence?.lifecycleStatus === 'PAUSED_REPLACEMENT_REQUIRED')

  if (screen === 'LOBBY' && lobby.snapshot !== null && lobby.selfSeatId !== null) {
    return (
      <LobbyPage
        busy={busy}
        connectionState={lobby.connectionState}
        error={localError ?? lobby.error?.message ?? null}
        onCopyRoomCode={() => {
          void run(() => navigator.clipboard.writeText(lobby.snapshot?.roomCode ?? ''))
        }}
        onLeave={() => {
          void run(async () => {
            await lobbyGateway.leaveRoom()
            setMode('LOCAL')
            setScreen('HOME')
          })
        }}
        onReadyChange={(ready) => { void run(() => lobbyGateway.setReady(ready)) }}
        onStart={() => { void run(() => lobbyGateway.startGame()) }}
        onSetAiSeat={(seatId, profileId) => {
          void run(() => lobbyGateway.setAiSeat(seatId, profileId))
        }}
        selfSeatId={lobby.selfSeatId}
        snapshot={lobby.snapshot}
      />
    )
  }

  if (screen === 'GAME' && mode === 'ONLINE' && session.view === null) {
    return <Container component="main" maxWidth="sm" sx={{ py: 5 }}>
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">Online Multiplayer</Typography>
        <Typography>{lobby.snapshot === null ? 'Your online session is no longer active.' : 'Loading your current game view…'}</Typography>
        {effectiveError === null ? <LinearProgress /> : <Alert severity="error">{effectiveError}</Alert>}
        <Button disabled={busy || session.resynchronizing || session.connectionStatus !== 'READY'}
          onClick={() => { void run(async () => { await onlineGateway?.requestSnapshot() }) }}>Resync game</Button>
        {lobby.snapshot !== null ? null : <Button onClick={() => { void run(async () => {
          await lobbyGateway.leaveRoom()
          onlineSessionStore.getState().reset()
          setMode('LOCAL')
          setScreen('HOME')
        }) }}>Return Home</Button>}
      </Stack>
    </Container>
  }

  if (screen === 'HOME' || session.view === null) {
    return (
      <HomePage
        busy={busy}
        error={effectiveError}
        hasSavedGame={hasSavedGame}
        humanName={humanName}
        onContinue={() => {
          void run(async () => {
            await localGateway.loadLatestGame()
            setMode('LOCAL')
            setActiveSetup(null)
            setScreen('GAME')
            uiStore.getState().reset()
          })
        }}
        onDeleteSave={() => {
          void run(async () => {
            await localGateway.deleteSavedGame()
            setHasSavedGame(false)
          })
        }}
        onCreateOnlineRoom={() => {
          void run(async () => {
            await lobbyGateway.createRoom(humanName)
            setMode('ONLINE')
            setScreen('LOBBY')
          })
        }}
        onGenerateSeed={() => setSeed(seedFactory())}
        onHumanNameChange={setHumanName}
        onJoinOnlineRoom={() => {
          void run(async () => {
            await lobbyGateway.joinRoom(humanName, onlineRoomCode)
            setMode('ONLINE')
            setScreen('LOBBY')
          })
        }}
        onOnlineRoomCodeChange={setOnlineRoomCode}
        onSeedChange={setSeed}
        onStart={() => startGame({ humanName, seed })}
        onlineRoomCode={onlineRoomCode}
        seed={seed}
      />
    )
  }

  return (
    <GamePage
      aiThinking={session.aiThinking}
      buildMode={ui.selectedBuildMode}
      busy={busy || onlinePaused || (mode === 'ONLINE' && (session.submitting || session.resynchronizing || session.delivery?.status === 'RESYNC_REQUIRED' || session.connectionStatus !== 'READY'))}
      canRestart={activeSetup !== null}
      createTradeId={createTradeId}
      error={effectiveError}
      events={session.recentEvents}
      onBuildModeChange={ui.setSelectedBuildMode}
      onCommand={submitCommand}
      onNewGame={() => {
        void run(async () => {
          if (mode === 'ONLINE') await lobbyGateway.leaveRoom()
          setMode('LOCAL')
          setScreen('HOME')
          setLocalError(null)
          sessionStore.getState().reset()
          uiStore.getState().reset()
          setHasSavedGame(await localGateway.hasSavedGame())
        })
      }}
      onRestart={() => {
        if (activeSetup !== null) startGame(activeSetup)
      }}
      onSave={() => { void run(() => localGateway.saveGame()) }}
      saveStatus={session.saveStatus}
      {...(mode === 'ONLINE' && lobby.snapshot !== null ? { online: {
        roomCode: lobby.snapshot.roomCode,
        paused: onlinePaused,
        presence: lobby.selfSeatId === null ? null : <GamePresencePanel snapshot={lobby.snapshot} selfSeatId={lobby.selfSeatId}
          connected={lobby.connectionState === 'CONNECTED' && session.connectionStatus === 'READY'} busy={busy}
          onReplace={(seatId, profileId) => { void run(() => lobbyGateway.replaceExpiredHuman(seatId, profileId)) }}
          onClose={() => { void run(() => lobbyGateway.closeGame()) }} />,
        status: session.resynchronizing ? 'Resynchronizing'
          : session.delivery?.status === 'RETRYING' ? `Retrying command (${session.delivery.attempt - 1})`
            : session.delivery?.status === 'WAITING_RECONNECT' ? 'Waiting to reconnect'
              : session.delivery?.status === 'RESYNC_REQUIRED' ? 'Resync required'
                : session.submitting ? 'Sending command'
          : session.connectionStatus === 'READY' ? 'Connected'
            : session.connectionStatus === 'RECONNECTING' ? 'Reconnecting'
              : session.connectionStatus === 'CONNECTING' ? 'Connecting'
                : session.connectionStatus === 'ERROR' ? 'Game unavailable' : 'Disconnected',
        onResync: () => { void run(async () => { await onlineGateway?.requestSnapshot() }) },
        resyncDisabled: busy || session.submitting || session.resynchronizing || lobby.connectionState !== 'CONNECTED',
      } } : {})}
      view={session.view}
    />
  )
}
