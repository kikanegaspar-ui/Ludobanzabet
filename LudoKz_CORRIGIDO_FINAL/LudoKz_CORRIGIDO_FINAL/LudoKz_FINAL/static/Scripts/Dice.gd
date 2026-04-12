## Dice.gd
## O dado JÁ NÃO gera números aleatórios.
## Só anima visualmente e pede ao backend para rolar.
## O número real vem do Flask em /api/game/roll
class_name Dice
extends Node2D

@export var Maindice:         Sprite2D
@export var DicesSpriteArray: Array[Texture2D]  # Índices 0-5 = faces 1-6

# Referência ao BoardManager (para pedir roll)
var boardManager: BoardManager

# Sinais locais (para compatibilidade)
signal OnDiceRolled(value: int)
signal OnDiceRollBegin

var _is_animating: bool = false

func _ready() -> void:
	boardManager = get_tree().get_first_node_in_group("BoardManager")

	# Ouvir resultado do dado vindo do backend
	NetworkManager.OnRollResult.connect(_on_backend_dice_result)
	print("[Dice] Pronto — dado controlado pelo backend")

# ── Clique no dado ───────────────────────────────────────────────────────────
func _input(event: InputEvent) -> void:
	if _is_animating: return
	if GameManager.GameCurrentState != GameManager.GameStateEnum.PlayerCanRollDice: return

	var diceClicked      = event.is_action_pressed("DiceClick")
	var isClickedOnSprite = Maindice.is_pixel_opaque(Maindice.get_local_mouse_position())

	if diceClicked and isClickedOnSprite:
		_request_roll()

# ── Pedir ao backend para rolar ──────────────────────────────────────────────
func _request_roll() -> void:
	if _is_animating: return
	print("[Dice] A pedir roll ao backend...")
	_is_animating = true
	OnDiceRollBegin.emit()
	GameManager.UpdateGameCurrentState(GameManager.GameStateEnum.Null)

	# Animar o dado enquanto aguarda resposta
	_animate_waiting()

	# O NetworkManager envia o pedido ao Flask
	NetworkManager.roll_dice()

# ── Receber resultado do backend ─────────────────────────────────────────────
func _on_backend_dice_result(state: Dictionary, dice: int) -> void:
	# Parar animação de espera
	_is_animating = false

	# Mostrar a face correcta
	SetSpriteByIndex(dice - 1)

	print("[Dice] Resultado do backend: ", dice)
	OnDiceRolled.emit(dice)

# ── Animar o dado enquanto aguarda resposta do servidor ─────────────────────
func _animate_waiting() -> void:
	for i in range(8):
		await get_tree().create_timer(0.12).timeout
		if not _is_animating: break
		var random_face = randi() % 6
		SetSpriteByIndex(random_face)

func SetSpriteByIndex(index: int) -> void:
	if index < 0 or index >= DicesSpriteArray.size(): return
	Maindice.texture = DicesSpriteArray[index]

# ── API pública para o BoardManager ─────────────────────────────────────────
func TriggerRoll() -> void:
	_request_roll()
