import { useStore } from 'zustand'
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
  const gateway = useMemo(() => providedGateway ?? createBrowserGateway(), [providedGateway])
  const lobbyGateway = useMemo(
    () => providedLobbyGateway ?? createBrowserLobbyGateway(),
    [providedLobbyGateway],
  )
  const sessionStore = useMemo(() => createGameSessionStore(), [])
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

  useEffect(() => gateway.subscribe(sessionStore.getState().applyGatewayUpdate), [gateway, sessionStore])
  useEffect(() => lobbyGateway.subscribe(setLobby), [lobbyGateway])
  useEffect(() => {
    let active = true
    void lobbyGateway.resumeSession().then((resumed) => {
      if (active && resumed) setScreen('LOBBY')
    }).catch((error: unknown) => {
      if (active) setLocalError(error instanceof Error ? error.message : String(error))
    })
    return () => { active = false }
  }, [lobbyGateway])
  useEffect(() => {
    let active = true
    void gateway.hasSavedGame().then((available) => {
      if (active) setHasSavedGame(available)
    }).catch(() => {
      if (active) setHasSavedGame(false)
    })
    return () => { active = false }
  }, [gateway])

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
      await gateway.createGame(createBrowserGameConfig(normalized.humanName, normalized.seed), normalized.seed)
      setActiveSetup(normalized)
      setHasSavedGame(true)
      setScreen('GAME')
      uiStore.getState().reset()
    })
  }, [gateway, run, uiStore])

  const submitCommand = useCallback((command: GameCommand): void => {
    const view = sessionStore.getState().view
    if (view === null) return
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
      setHasSavedGame(true)
    })
  }, [gateway, run, sessionStore, uiStore])

  const createTradeId = useCallback((): TradeId => {
    const stateVersion = sessionStore.getState().view?.stateVersion ?? 0
    const tradeNumber = tradeCounter.current
    tradeCounter.current += 1
    return `trade:ui:${stateVersion}:${tradeNumber}` as TradeId
  }, [sessionStore])

  const effectiveError = localError ?? lobby.error?.message ?? session.error

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
            setScreen('HOME')
          })
        }}
        onReadyChange={(ready) => { void run(() => lobbyGateway.setReady(ready)) }}
        onSetAiSeat={(seatId, profileId) => {
          void run(() => lobbyGateway.setAiSeat(seatId, profileId))
        }}
        selfSeatId={lobby.selfSeatId}
        snapshot={lobby.snapshot}
      />
    )
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
            await gateway.loadLatestGame()
            setActiveSetup(null)
            setScreen('GAME')
            uiStore.getState().reset()
          })
        }}
        onDeleteSave={() => {
          void run(async () => {
            await gateway.deleteSavedGame()
            setHasSavedGame(false)
          })
        }}
        onCreateOnlineRoom={() => {
          void run(async () => {
            await lobbyGateway.createRoom(humanName)
            setScreen('LOBBY')
          })
        }}
        onGenerateSeed={() => setSeed(seedFactory())}
        onHumanNameChange={setHumanName}
        onJoinOnlineRoom={() => {
          void run(async () => {
            await lobbyGateway.joinRoom(humanName, onlineRoomCode)
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
      busy={busy}
      canRestart={activeSetup !== null}
      createTradeId={createTradeId}
      error={effectiveError}
      events={session.recentEvents}
      onBuildModeChange={ui.setSelectedBuildMode}
      onCommand={submitCommand}
      onNewGame={() => {
        setScreen('HOME')
        setLocalError(null)
        sessionStore.getState().reset()
        uiStore.getState().reset()
        void gateway.hasSavedGame().then(setHasSavedGame)
      }}
      onRestart={() => {
        if (activeSetup !== null) startGame(activeSetup)
      }}
      onSave={() => { void run(() => gateway.saveGame()) }}
      saveStatus={session.saveStatus}
      view={session.view}
    />
  )
}
