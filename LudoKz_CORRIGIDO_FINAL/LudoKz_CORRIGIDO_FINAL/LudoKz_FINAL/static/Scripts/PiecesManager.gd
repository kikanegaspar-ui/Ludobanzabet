## PiecesManager.gd
## Gere os grupos de peças de cada cor.
class_name PiecesManager
extends Node2D

@export var BluePieces:   PlayerPiecesGroup
@export var YellowPieces: PlayerPiecesGroup
@export var GreenPieces:  PlayerPiecesGroup
@export var RedPieces:    PlayerPiecesGroup

# ── Obter grupo por cor ───────────────────────────────────────────────────────
func GetPieceGroupBasedOnType(playerColor: GameManager.PlayerColor) -> PlayerPiecesGroup:
	match playerColor:
		GameManager.PlayerColor.Green:  return GreenPieces
		GameManager.PlayerColor.Yellow: return YellowPieces
		GameManager.PlayerColor.Blue:   return BluePieces
		GameManager.PlayerColor.Red:    return RedPieces
		_: return null

# ── Verificar se o jogo acabou ───────────────────────────────────────────────
func IsGameOver() -> bool:
	return (BluePieces.HasThisPlayerCompleted()   and
			YellowPieces.HasThisPlayerCompleted() and
			GreenPieces.HasThisPlayerCompleted()  and
			RedPieces.HasThisPlayerCompleted())

# ── Verificar se o jogador tem peças desbloqueadas ───────────────────────────
func HasThisPlayerUnlockedTurn(playerColor: GameManager.PlayerColor) -> bool:
	match playerColor:
		GameManager.PlayerColor.Green:  return GreenPieces.HasUnlockedAnyPiece()
		GameManager.PlayerColor.Yellow: return YellowPieces.HasUnlockedAnyPiece()
		GameManager.PlayerColor.Blue:   return BluePieces.HasUnlockedAnyPiece()
		GameManager.PlayerColor.Red:    return RedPieces.HasUnlockedAnyPiece()
	return false

# ── Animar peças movíveis ────────────────────────────────────────────────────
## Animar APENAS as peças que o backend diz que podem mover-se
func PlayAnimationForMovable(playerColor: GameManager.PlayerColor, movable: Array) -> void:
	var group = GetPieceGroupBasedOnType(playerColor)
	if group == null: return
	group.PlayAnimationForIndices(movable)

## Animar todas as peças de uma cor (legado)
func PlayAnimationByPlayerIndex(playerColor: GameManager.PlayerColor) -> void:
	match playerColor:
		GameManager.PlayerColor.Green:  GreenPieces.PlayAllPieceAnimation()
		GameManager.PlayerColor.Yellow: YellowPieces.PlayAllPieceAnimation()
		GameManager.PlayerColor.Blue:   BluePieces.PlayAllPieceAnimation()
		GameManager.PlayerColor.Red:    RedPieces.PlayAllPieceAnimation()

# ── Parar todas as animações ──────────────────────────────────────────────────
func StopAnimation() -> void:
	GreenPieces.StopAllPieceAnimation()
	YellowPieces.StopAllPieceAnimation()
	BluePieces.StopAllPieceAnimation()
	RedPieces.StopAllPieceAnimation()
