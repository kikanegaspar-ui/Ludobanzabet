## PlayerPieceGroup.gd
## Grupo de 4 peças de um jogador.
class_name PlayerPiecesGroup
extends Node2D

@export var Pieces:              Array[Piece]
@export var PlayerFirstPosition: int
@export var CurrentPlayerColor:  GameManager.PlayerColor

func _ready() -> void:
	# Inicializar posição de lobby para todas as peças
	for i in range(Pieces.size()):
		Pieces[i].SetStartPosition(PlayerFirstPosition)
		Pieces[i].CurrentState = GameManager.PieceStateEnum.InLobby

# ── Obter peça por índice ────────────────────────────────────────────────────
func GetPieceByIndex(index: int) -> Piece:
	if index < 0 or index >= Pieces.size(): return null
	return Pieces[index]

## Obter o índice de uma peça dentro deste grupo
func GetPieceIndex(piece: Piece) -> int:
	for i in range(Pieces.size()):
		if Pieces[i] == piece:
			return i
	return -1

# ── Estado do grupo ──────────────────────────────────────────────────────────
func HasThisPlayerCompleted() -> bool:
	for piece in Pieces:
		if not piece.IsInHome:
			return false
	return true

func HasUnlockedAnyPiece() -> bool:
	for piece in Pieces:
		if piece.CurrentState != GameManager.PieceStateEnum.InLobby:
			return true
	return false

# ── Animações ────────────────────────────────────────────────────────────────
func PlayAllPieceAnimation() -> void:
	for piece in Pieces:
		if piece.CurrentState != GameManager.PieceStateEnum.InHouse:
			piece.PlayAnimation()

## Animar apenas as peças nos índices especificados (movíveis pelo backend)
func PlayAnimationForIndices(indices: Array) -> void:
	for i in range(Pieces.size()):
		if indices.has(i) and not Pieces[i].IsInHome:
			Pieces[i].PlayAnimation()
		else:
			Pieces[i].StopAnimation()

func StopAllPieceAnimation() -> void:
	for piece in Pieces:
		piece.StopAnimation()
