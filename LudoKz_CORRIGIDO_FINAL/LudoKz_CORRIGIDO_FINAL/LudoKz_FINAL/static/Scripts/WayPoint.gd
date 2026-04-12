## WayPoint.gd
## Representa uma casa no tabuleiro.
## Kill logic foi movida para o backend — aqui só guardamos referências visuais.
class_name WayPoint
extends Node2D

@export var isThisSafePlace:   bool
@export var IsThisHomePlace:   bool

var myHoldings: Array[Piece] = []

func _ready() -> void:
	pass

func SetPiece(piece: Piece) -> void:
	myHoldings.push_back(piece)
	if IsThisHomePlace:
		piece.IsInHome = true

func RemoveMyRef(piece: Piece) -> void:
	myHoldings.erase(piece)

func ClearMe() -> void:
	myHoldings.clear()

## Verificar se tem peças de oponente (informativo, não executa kill)
func HasOpponentPiece(myColor: GameManager.PlayerColor) -> bool:
	if isThisSafePlace: return false
	for piece in myHoldings:
		if piece.CurrentPlayerColor != myColor:
			return true
	return false
