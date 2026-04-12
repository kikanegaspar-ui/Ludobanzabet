## GameManager.gd
## Autoload singleton — gere o estado do jogo online com o backend LudoKz.
## NÃO contém lógica de jogo local. O backend Flask decide tudo.
extends Node

# ── Enums (mantidos para compatibilidade com os outros scripts) ──────────────
enum GameStateEnum { Null, PlayerCanRollDice, PlayerSelectPiece, GameOver }
enum PieceStateEnum { InLobby, InWayPoint, InHouse }
enum PlayerColor    { Green, Yellow, Blue, Red }

# ── Estado actual do jogo ────────────────────────────────────────────────────
var GameCurrentState: GameStateEnum = GameStateEnum.Null

# ── Dados do jogador local (vindos do site via JavaScript) ───────────────────
var my_user_id:   int    = -1
var my_user_name: String = ""
var room_id:      String = ""
var session_cookie: String = ""   # cookie de sessão passado pelo site

# ── Estado completo recebido do backend ─────────────────────────────────────
var current_state: Dictionary = {}
var my_color: PlayerColor = PlayerColor.Green

# ── URL base do backend ──────────────────────────────────────────────────────
# Em produção é passado pelo JavaScript do site via JavaScriptBridge
var backend_url: String = "https://ludobanzabet.onrender.com"

# ── Sinais ───────────────────────────────────────────────────────────────────
signal OnGameCurrentStateChange(updatedGameState: GameStateEnum)
signal OnPlayerSelectPiece(value: Piece)
signal OnStateReceived(state: Dictionary)
signal OnGameOver(data: Dictionary)
signal OnDiceResult(value: int)
signal OnError(message: String)

# ── Inicialização ────────────────────────────────────────────────────────────
func _ready() -> void:
	# Receber dados do site via JavaScript (quando exportado para HTML5)
	_setup_js_bridge()
	print("[GameManager] Pronto. Backend: ", backend_url)

func _setup_js_bridge() -> void:
	if not OS.has_feature("web"):
		# Modo de desenvolvimento — usar valores de teste
		print("[GameManager] Modo desktop — usando dados de teste")
		my_user_id   = -999
		my_user_name = "TestPlayer"
		room_id      = ""
		return

	# Ler dados passados pelo JavaScript do site
	var js_uid  = JavaScriptBridge.eval("window.GODOT_USER_ID   || -1")
	var js_name = JavaScriptBridge.eval("window.GODOT_USER_NAME || ''")
	var js_room = JavaScriptBridge.eval("window.GODOT_ROOM_ID   || ''")
	var js_url  = JavaScriptBridge.eval("window.GODOT_BACKEND_URL || ''")

	if js_uid  != null: my_user_id   = int(js_uid)
	if js_name != null: my_user_name = str(js_name)
	if js_room != null: room_id      = str(js_room)
	if js_url  != null and str(js_url) != "":
		backend_url = str(js_url)

	print("[GameManager] UID:", my_user_id, " Room:", room_id, " Backend:", backend_url)

# ── Actualizar estado do jogo ────────────────────────────────────────────────
func UpdateGameCurrentState(state: GameStateEnum) -> void:
	GameCurrentState = state
	OnGameCurrentStateChange.emit(GameCurrentState)

# ── Processar estado recebido do backend ─────────────────────────────────────
func ProcessBackendState(state: Dictionary) -> void:
	if state.is_empty(): return
	current_state = state

	# Determinar a minha cor com base no user_id
	if state.has("players"):
		for p in state["players"]:
			if p.get("user_id") == my_user_id:
				my_color = _colour_from_string(p.get("colour", "green"))
				break

	# Determinar estado do jogo
	var phase     = state.get("phase", -1)
	var is_my_turn = _is_my_turn(state)

	if state.get("over", false):
		UpdateGameCurrentState(GameStateEnum.GameOver)
	elif phase == 0 and is_my_turn:
		UpdateGameCurrentState(GameStateEnum.PlayerCanRollDice)
	elif phase == 1 and is_my_turn:
		UpdateGameCurrentState(GameStateEnum.PlayerSelectPiece)
	else:
		UpdateGameCurrentState(GameStateEnum.Null)

	OnStateReceived.emit(state)

# ── Verificar se é a vez do jogador local ───────────────────────────────────
func _is_my_turn(state: Dictionary) -> bool:
	if not state.has("players"): return false
	var turn = state.get("turn", -1)
	if turn < 0 or turn >= state["players"].size(): return false
	return state["players"][turn].get("user_id") == my_user_id

# ── Converter string de cor em enum ─────────────────────────────────────────
func _colour_from_string(colour_str: String) -> PlayerColor:
	match colour_str.to_lower():
		"green":  return PlayerColor.Green
		"yellow": return PlayerColor.Yellow
		"blue":   return PlayerColor.Blue
		"red":    return PlayerColor.Red
	return PlayerColor.Green

func colour_to_string(color: PlayerColor) -> String:
	match color:
		PlayerColor.Green:  return "green"
		PlayerColor.Yellow: return "yellow"
		PlayerColor.Blue:   return "blue"
		PlayerColor.Red:    return "red"
	return "green"
