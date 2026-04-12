## BoardManager.gd
## Gere o tabuleiro — recebe o estado do backend e actualiza as peças visualmente.
## NÃO gera dados, NÃO valida movimentos — tudo vem do Flask.
class_name BoardManager
extends Node2D

# ── Referências de cena ──────────────────────────────────────────────────────
@export var way_points:                 WayPointsManager
@export var piecesManager:              PiecesManager
@export var animation_PlayerForPlaces:  AnimationPlayer
@export var ui_manager:                 Node           # referência ao UIManager

# ── Estado interno ───────────────────────────────────────────────────────────
var currentPlayerTurnIndex: int                     = -1
var currentDiceValue:       int                     = -1
var currentAnimationPlaceName: String               = ""
var currentPlayerColor:     GameManager.PlayerColor = GameManager.PlayerColor.Green
var _movable_pieces:        Array                   = []
var _waiting_move:          bool                    = false

# ── Inicialização ────────────────────────────────────────────────────────────
func _ready() -> void:
	add_to_group("BoardManager")

	# Ligar a sinais do NetworkManager
	NetworkManager.OnRollResult.connect(_on_roll_result)
	NetworkManager.OnMoveResult.connect(_on_move_result)
	NetworkManager.OnStateUpdate.connect(_on_state_update)
	NetworkManager.OnGameStarted.connect(_on_game_started)
	NetworkManager.OnGameOverReceived.connect(_on_game_over)
	NetworkManager.OnMovableResult.connect(_on_movable_result)
	NetworkManager.OnNetworkError.connect(_on_network_error)

	# Ligar sinal de selecção de peça
	GameManager.OnPlayerSelectPiece.connect(_on_player_select_piece)

	print("[BoardManager] Pronto")

# ════════════════════════════════════════════════════════════════
#  EVENTOS DO BACKEND
# ════════════════════════════════════════════════════════════════

func _on_game_started(state: Dictionary) -> void:
	print("[BoardManager] Jogo iniciado!")
	_apply_state(state)
	_play_turn_animation()

func _on_state_update(state: Dictionary) -> void:
	_apply_state(state)

func _on_roll_result(state: Dictionary, dice: int) -> void:
	currentDiceValue = dice
	print("[BoardManager] Dado rolado: ", dice)
	_apply_state(state)

func _on_move_result(state: Dictionary) -> void:
	_waiting_move = false
	_movable_pieces.clear()
	piecesManager.StopAnimation()
	_apply_state(state)

func _on_movable_result(movable: Array, dice: int) -> void:
	_movable_pieces = movable
	currentDiceValue = dice

	if movable.is_empty():
		print("[BoardManager] Nenhuma peça pode mover — turno passa automaticamente")
		return

	print("[BoardManager] Peças movíveis: ", movable)
	# Animar apenas as peças do jogador local que podem mover-se
	piecesManager.PlayAnimationForMovable(GameManager.my_color, movable)

func _on_game_over(data: Dictionary) -> void:
	print("[BoardManager] Jogo terminado!")
	animation_PlayerForPlaces.stop()
	piecesManager.StopAnimation()
	# O UIManager trata de mostrar o ecrã de fim de jogo
	if ui_manager and ui_manager.has_method("ShowGameOver"):
		ui_manager.ShowGameOver(data)

func _on_network_error(message: String) -> void:
	push_error("[BoardManager] Erro de rede: " + message)
	if ui_manager and ui_manager.has_method("ShowError"):
		ui_manager.ShowError(message)

# ════════════════════════════════════════════════════════════════
#  APLICAR ESTADO DO BACKEND
# ════════════════════════════════════════════════════════════════

func _apply_state(state: Dictionary) -> void:
	if state.is_empty() or not state.has("players"): return

	var turn   = int(state.get("turn", 0))
	var players = state["players"] as Array

	if turn >= players.size(): return

	currentPlayerTurnIndex = turn
	var turn_player = players[turn]
	currentPlayerColor = GameManager._colour_from_string(
		turn_player.get("colour", "green")
	)

	# Actualizar posições de TODAS as peças
	for player_data in players:
		_update_player_pieces(player_data)

	# Animar o lugar do jogador actual
	_play_turn_animation()

	# Actualizar UI
	if ui_manager and ui_manager.has_method("UpdateUI"):
		ui_manager.UpdateUI(state)

func _update_player_pieces(player_data: Dictionary) -> void:
	var colour_str = player_data.get("colour", "green")
	var color      = GameManager._colour_from_string(colour_str)
	var tokens     = player_data.get("tokens", []) as Array
	var piece_group = piecesManager.GetPieceGroupBasedOnType(color)

	if piece_group == null: return

	for i in range(tokens.size()):
		if i >= 4: break
		var token = tokens[i] as Dictionary
		var piece = piece_group.GetPieceByIndex(i)
		if piece == null: continue

		var is_locked       = token.get("is_locked", true)
		var has_reached_home = token.get("has_reached_home", false)
		var tx              = float(token.get("x", 0.0))
		var ty              = float(token.get("y", 0.0))

		# Actualizar estado da peça
		if has_reached_home:
			piece.CurrentState = GameManager.PieceStateEnum.InHouse
			piece.IsInHome     = true
		elif is_locked:
			piece.CurrentState = GameManager.PieceStateEnum.InLobby
		else:
			piece.CurrentState = GameManager.PieceStateEnum.InWayPoint

		# Actualizar posição visual
		# As coordenadas do backend (x=linha, y=coluna) são convertidas
		# para posição de ecrã pelo WayPointsManager
		var screen_pos = way_points.GetScreenPositionFromBackend(tx, ty, color)
		if screen_pos != Vector2.ZERO:
			piece.position = screen_pos

# ════════════════════════════════════════════════════════════════
#  INTERACÇÃO DO JOGADOR
# ════════════════════════════════════════════════════════════════

func _on_player_select_piece(piece: Piece) -> void:
	if _waiting_move: return

	var player_type  = piece.CurrentPlayerColor
	var is_my_turn   = (player_type == GameManager.my_color)
	var is_game_turn = (GameManager.GameCurrentState == GameManager.GameStateEnum.PlayerSelectPiece)

	if not is_my_turn or not is_game_turn:
		push_warning("[BoardManager] Não é a tua vez!")
		return

	# Descobrir o índice da peça dentro do seu grupo
	var piece_group = piecesManager.GetPieceGroupBasedOnType(player_type)
	if piece_group == null: return

	var piece_index = piece_group.GetPieceIndex(piece)
	if piece_index < 0:
		push_error("[BoardManager] Índice de peça inválido")
		return

	# Verificar se esta peça está na lista de movíveis
	if not _movable_pieces.has(piece_index):
		push_warning("[BoardManager] Esta peça não pode mover-se agora")
		return

	print("[BoardManager] Jogador seleccionou peça ", piece_index)
	_waiting_move = true
	piecesManager.StopAnimation()
	GameManager.UpdateGameCurrentState(GameManager.GameStateEnum.Null)

	# Enviar movimento para o backend
	NetworkManager.move_piece(piece_index)

# ── Pedir ao backend para rolar o dado ──────────────────────────────────────
func RequestRollDice() -> void:
	if GameManager.GameCurrentState != GameManager.GameStateEnum.PlayerCanRollDice:
		return
	GameManager.UpdateGameCurrentState(GameManager.GameStateEnum.Null)
	NetworkManager.roll_dice()

# ════════════════════════════════════════════════════════════════
#  ANIMAÇÕES
# ════════════════════════════════════════════════════════════════

func _play_turn_animation() -> void:
	var anim_name: String
	match currentPlayerTurnIndex:
		0: anim_name = "GreenPlaceAnimation"
		1: anim_name = "YellowPlaceAnimation"
		2: anim_name = "BluePlaceAnimation"
		3: anim_name = "RedPlaceAnimation"
		_: return

	animation_PlayerForPlaces.stop()
	animation_PlayerForPlaces.play(anim_name)
