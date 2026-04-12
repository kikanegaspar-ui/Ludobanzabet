## Piece.gd
## Representa uma peça no tabuleiro.
## Posição e estado são definidos pelo backend — não calcula nada localmente.
class_name Piece
extends Node2D

# ── Estado (actualizado pelo BoardManager a partir do backend) ───────────────
var CurrentPosition:  int                           = 0
var CurrentState:     GameManager.PieceStateEnum    = GameManager.PieceStateEnum.InLobby
var StartingPosition: int                           = 0
var CurrentWayPoint:  WayPoint                      = null
var IsInHome:         bool                          = false

@export var CurrentPlayerColor: GameManager.PlayerColor
@export var PieceSprite:        Sprite2D
@export var animation_PieceSelect: AnimationPlayer

# ── Inicialização ────────────────────────────────────────────────────────────
func _ready() -> void:
	pass

func SetStartPosition(index: int) -> void:
	CurrentPosition  = index
	StartingPosition = index

# ── Clicar na peça ───────────────────────────────────────────────────────────
func _input(event: InputEvent) -> void:
	if IsInHome: return
	if GameManager.GameCurrentState != GameManager.GameStateEnum.PlayerSelectPiece: return

	# Só o jogador local pode seleccionar as suas próprias peças
	if CurrentPlayerColor != GameManager.my_color: return

	var playerClick      = event.is_action_pressed("PlayerClick")
	var isClickedOnSprite = PieceSprite.is_pixel_opaque(PieceSprite.get_local_mouse_position())

	if playerClick and isClickedOnSprite:
		_emit_selected()

# ── Emitir sinal de selecção ─────────────────────────────────────────────────
func _emit_selected() -> void:
	if IsInHome: return
	if CurrentWayPoint != null:
		CurrentWayPoint.RemoveMyRef(self)
	GameManager.OnPlayerSelectPiece.emit(self)

# ── Usado pelo BoardManager para forçar selecção (AI/auto) ───────────────────
func AIInput() -> void:
	_emit_selected()

# ── Animações ────────────────────────────────────────────────────────────────
func PlayAnimation() -> void:
	if CurrentState != GameManager.PieceStateEnum.InHouse and not IsInHome:
		animation_PieceSelect.play("PieceAnimation_Select")

func StopAnimation() -> void:
	animation_PieceSelect.stop()

# ── Getters/Setters ──────────────────────────────────────────────────────────
func GetCurrentPosition() -> int:
	return CurrentPosition

func HasThisPlayerUnlockedPiece() -> bool:
	return CurrentState == GameManager.PieceStateEnum.InLobby

## Actualizar posição sem lógica de kill (o backend trata disso)
func SetCurrentPosition(index: int) -> void:
	CurrentPosition = index
