## UIManager.gd
## Gere toda a interface do utilizador durante o jogo.
extends Node

# ── Referências UI ────────────────────────────────────────────────────────────
@export var label_turn:       Label      # "É a vez de: Verde"
@export var label_dice:       Label      # "Dado: 6"
@export var label_status:     Label      # "A aguardar adversário..."
@export var panel_game_over:  Control    # Painel de fim de jogo
@export var label_result:     Label      # "Vitória!" ou "Derrota"
@export var label_prize:      Label      # "Prémio: 9.500 Kz"
@export var btn_leave:        Button     # Botão sair
@export var panel_error:      Control    # Painel de erro
@export var label_error:      Label      # Mensagem de erro
@export var label_players:    Label      # Lista de jogadores

const COLOR_NAMES: Dictionary = {
	"green":  "Verde 🟢",
	"yellow": "Amarelo 🟡",
	"blue":   "Azul 🔵",
	"red":    "Vermelho 🔴",
}

func _ready() -> void:
	if panel_game_over: panel_game_over.visible = false
	if panel_error:     panel_error.visible     = false
	if label_status:    label_status.text       = "A ligar ao servidor..."

	NetworkManager.OnConnected.connect(_on_connected)
	NetworkManager.OnNetworkError.connect(ShowError)
	GameManager.OnGameCurrentStateChange.connect(_on_state_change)

func _on_connected() -> void:
	if label_status: label_status.text = "Ligado! A aguardar jogo..."

func _on_state_change(state: GameManager.GameStateEnum) -> void:
	if label_status == null: return
	match state:
		GameManager.GameStateEnum.PlayerCanRollDice:
			label_status.text = "🎲 Lança o dado!"
		GameManager.GameStateEnum.PlayerSelectPiece:
			label_status.text = "👆 Escolhe uma peça"
		GameManager.GameStateEnum.Null:
			label_status.text = "⏳ Aguarda..."
		GameManager.GameStateEnum.GameOver:
			label_status.text = "🏁 Jogo terminado"

func UpdateUI(state: Dictionary) -> void:
	if not state.has("players"): return

	var turn    = int(state.get("turn", 0))
	var players = state["players"] as Array
	var dice    = int(state.get("dice", 0))

	# Turno actual
	if turn < players.size() and label_turn:
		var current = players[turn]
		var colour  = current.get("colour", "green")
		var name    = current.get("name", "Jogador")
		var is_me   = current.get("user_id") == GameManager.my_user_id
		label_turn.text = "Turno: " + name + (  " (Tu)" if is_me else "") + \
						  " — " + COLOR_NAMES.get(colour, colour)

	# Dado
	if dice > 0 and label_dice:
		label_dice.text = "Dado: " + str(dice)

	# Lista de jogadores
	if label_players:
		var player_text = ""
		for p in players:
			var col    = p.get("colour", "?")
			var nm     = p.get("name", "?")
			var fin    = int(p.get("fin", 0))
			var is_me  = p.get("user_id") == GameManager.my_user_id
			player_text += COLOR_NAMES.get(col, col) + " " + nm
			if is_me: player_text += " ✓"
			player_text += " — " + str(fin) + "/4\n"
		label_players.text = player_text.strip_edges()

func ShowGameOver(data: Dictionary) -> void:
	if panel_game_over == null: return
	panel_game_over.visible = true

	var won   = data.get("won", false)
	var prize = float(data.get("prize", 0))

	if label_result:
		label_result.text = "🏆 VITÓRIA!" if won else "💀 DERROTA"

	if label_prize:
		if won:
			label_prize.text = "Prémio: " + _fmt_kz(prize) + " Kz"
		else:
			label_prize.text = "Tenta novamente!"

	# Notificar o site (JavaScript) sobre o fim do jogo
	if OS.has_feature("web"):
		var js = "if(window.onGodotGameOver) window.onGodotGameOver(" + \
				 JSON.stringify(data) + ");"
		JavaScriptBridge.eval(js)

func ShowError(message: String) -> void:
	if panel_error == null:
		push_error("[UIManager] Erro: " + message)
		return
	panel_error.visible = true
	if label_error: label_error.text = "❌ " + message
	# Auto-esconder após 4 segundos
	await get_tree().create_timer(4.0).timeout
	if panel_error: panel_error.visible = false

func _fmt_kz(value: float) -> String:
	return str(int(value)).pad_decimals(0)

func _on_btn_leave_pressed() -> void:
	NetworkManager.leave_game()
	# Notificar o site para voltar ao lobby
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.onGodotLeave) window.onGodotLeave();")
