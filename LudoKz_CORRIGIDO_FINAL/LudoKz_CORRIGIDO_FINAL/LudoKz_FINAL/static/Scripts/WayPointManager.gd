## WayPointManager.gd
## Gere os waypoints do tabuleiro.
## NOVO: converte coordenadas do backend (x=linha, y=coluna) para posição de ecrã.
class_name WayPointsManager
extends Node2D

@export var main_path:   Node2D
@export var green_path:  Array[WayPoint]
@export var yellow_path: Array[WayPoint]
@export var blue_path:   Array[WayPoint]
@export var red_path:    Array[WayPoint]

# ── API original (por índice) ─────────────────────────────────────────────────
func GetPositionOfThisPoint(index: int, playerColor: GameManager.PlayerColor) -> Vector2:
	match playerColor:
		GameManager.PlayerColor.Green:  return green_path[index].position
		GameManager.PlayerColor.Yellow: return yellow_path[index].position
		GameManager.PlayerColor.Blue:   return blue_path[index].position
		GameManager.PlayerColor.Red:    return red_path[index].position
	return Vector2.ZERO

func GetCount(playerColor: GameManager.PlayerColor) -> int:
	match playerColor:
		GameManager.PlayerColor.Green:  return green_path.size()
		GameManager.PlayerColor.Yellow: return yellow_path.size()
		GameManager.PlayerColor.Blue:   return blue_path.size()
		GameManager.PlayerColor.Red:    return red_path.size()
	return -1

# ── NOVA API: converter coordenadas do backend para posição de ecrã ───────────
## O backend envia token.x (linha) e token.y (coluna) em coordenadas de grid.
## Esta função encontra o waypoint mais próximo dessa posição.
func GetScreenPositionFromBackend(row: float, col: float,
								  playerColor: GameManager.PlayerColor) -> Vector2:
	# Posições de lobby (is_locked = true) têm coordenadas decimais como 1.5, 10.2
	# Posições de jogo têm coordenadas inteiras
	var path = _get_path(playerColor)
	if path.is_empty(): return Vector2.ZERO

	# Procurar o waypoint mais próximo baseado nas coordenadas de grid
	# Cada waypoint tem uma posição de ecrã que corresponde a uma célula do grid
	# O tabuleiro é 15x15 células
	var best_wp: WayPoint = null
	var best_dist: float  = INF

	for wp in path:
		# Converter posição de ecrã do waypoint para coordenadas de grid aproximadas
		# (isto depende do tamanho do teu tabuleiro — ajustar se necessário)
		var wp_grid = _screen_to_grid(wp.position)
		var dist    = Vector2(row, col).distance_to(wp_grid)
		if dist < best_dist:
			best_dist = dist
			best_wp   = wp

	if best_wp == null: return Vector2.ZERO
	return best_wp.position

## Mapear por índice directo (mais eficiente quando o backend envia pos 0-56)
func GetPositionByBackendIndex(index: int, playerColor: GameManager.PlayerColor) -> Vector2:
	var path = _get_path(playerColor)
	if index < 0 or index >= path.size(): return Vector2.ZERO
	return path[index].position

func _get_path(playerColor: GameManager.PlayerColor) -> Array[WayPoint]:
	match playerColor:
		GameManager.PlayerColor.Green:  return green_path
		GameManager.PlayerColor.Yellow: return yellow_path
		GameManager.PlayerColor.Blue:   return blue_path
		GameManager.PlayerColor.Red:    return red_path
	return []

## Converter posição de ecrã para coordenadas de grid (15x15)
## Ajustar os valores de offset e cell_size ao teu tabuleiro
func _screen_to_grid(screen_pos: Vector2) -> Vector2:
	# Estes valores dependem do tamanho e posição do teu Board_Main.png
	# Ajusta conforme necessário após testar
	const BOARD_OFFSET: Vector2 = Vector2(0, 0)   # posição do topo-esquerdo do tabuleiro
	const CELL_SIZE:    float   = 73.0             # tamanho de cada célula em píxeis (1095/15)
	var grid_x = (screen_pos.y - BOARD_OFFSET.y) / CELL_SIZE
	var grid_y = (screen_pos.x - BOARD_OFFSET.x) / CELL_SIZE
	return Vector2(grid_x, grid_y)

# ── SetPieceToThisWayPoint (mantido para compatibilidade) ────────────────────
func SetPieceToThisWayPoint(index: int, piece: Piece) -> void:
	var path = _get_path(piece.CurrentPlayerColor)
	if index < 0 or index >= path.size(): return
	var wp = path[index]
	if wp == null: return
	piece.CurrentWayPoint = wp
	wp.SetPiece(piece)
