## NetworkManager.gd
## Autoload singleton — gere TODA a comunicação HTTP com o backend Flask.
## O dado é rolado pelo backend, não localmente.
extends Node

# ── Sinais ───────────────────────────────────────────────────────────────────
signal OnRollResult(state: Dictionary, dice: int)
signal OnMoveResult(state: Dictionary)
signal OnStateUpdate(state: Dictionary)
signal OnGameStarted(state: Dictionary)
signal OnGameOverReceived(data: Dictionary)
signal OnNetworkError(message: String)
signal OnMovableResult(movable: Array, dice: int)
signal OnConnected

# ── SSE (Server-Sent Events) ─────────────────────────────────────────────────
var _sse_active:    bool   = false
var _sse_buffer:    String = ""

# ── HTTP request nodes (criados dinamicamente) ───────────────────────────────
var _pending_requests: Array[HTTPRequest] = []

func _ready() -> void:
	print("[NetworkManager] Pronto")
	# Iniciar SSE após um pequeno delay para a cena carregar
	call_deferred("_start_sse")

# ════════════════════════════════════════════════════════════════
#  SSE — Receber eventos em tempo real do backend
# ════════════════════════════════════════════════════════════════

func _start_sse() -> void:
	if not OS.has_feature("web"):
		print("[NetworkManager] SSE não disponível em modo desktop — usar polling")
		_start_polling()
		return

	# Em HTML5 usar JavaScript nativo para SSE (mais fiável)
	_setup_js_sse()

func _setup_js_sse() -> void:
	if not OS.has_feature("web"): return

	var js_code = """
	(function() {
		if (window._ludoSSE) { window._ludoSSE.close(); }
		window._ludoSSE = new EventSource('/api/events', {withCredentials: true});

		window._ludoSSE.addEventListener('game_started', function(e) {
			window._godotSSEEvent = {type: 'game_started', data: e.data};
		});
		window._ludoSSE.addEventListener('game_update', function(e) {
			window._godotSSEEvent = {type: 'game_update', data: e.data};
		});
		window._ludoSSE.addEventListener('game_over', function(e) {
			window._godotSSEEvent = {type: 'game_over', data: e.data};
		});
		window._ludoSSE.addEventListener('connected', function(e) {
			window._godotSSEEvent = {type: 'connected', data: e.data};
		});

		console.log('[LudoKz Godot] SSE ligado');
	})();
	"""
	JavaScriptBridge.eval(js_code)
	_sse_active = true
	print("[NetworkManager] SSE JavaScript iniciado")

func _process(_delta: float) -> void:
	if _sse_active and OS.has_feature("web"):
		_poll_js_sse()

func _poll_js_sse() -> void:
	var event = JavaScriptBridge.eval("window._godotSSEEvent || null")
	if event == null: return

	# Limpar o evento após ler
	JavaScriptBridge.eval("window._godotSSEEvent = null")

	var type = str(event.get("type", ""))
	var raw  = str(event.get("data", "{}"))

	var json = JSON.new()
	if json.parse(raw) != OK: return
	var data = json.get_data()

	match type:
		"connected":
			print("[NetworkManager] SSE conectado!")
			OnConnected.emit()
		"game_started":
			print("[NetworkManager] Jogo iniciado via SSE")
			GameManager.ProcessBackendState(data)
			OnGameStarted.emit(data)
		"game_update":
			GameManager.ProcessBackendState(data)
			OnStateUpdate.emit(data)
		"game_over":
			OnGameOverReceived.emit(data)

# ── Polling fallback para modo desktop ───────────────────────────────────────
var _poll_timer: float = 0.0
const POLL_INTERVAL: float = 2.0

func _start_polling() -> void:
	print("[NetworkManager] Polling activo (modo desktop)")

func _poll_state() -> void:
	if GameManager.room_id == "": return
	var url = GameManager.backend_url + "/api/room/" + GameManager.room_id + "/state"
	_http_get(url, func(data):
		GameManager.ProcessBackendState(data)
		OnStateUpdate.emit(data)
	)

func _process_polling(delta: float) -> void:
	if _sse_active: return
	_poll_timer += delta
	if _poll_timer >= POLL_INTERVAL:
		_poll_timer = 0.0
		_poll_state()

# ════════════════════════════════════════════════════════════════
#  API CALLS
# ════════════════════════════════════════════════════════════════

## Rolar o dado — o backend gera o número, não o Godot
func roll_dice() -> void:
	print("[NetworkManager] A rolar dado...")
	var url  = GameManager.backend_url + "/api/game/roll"
	var body = JSON.stringify({"room_id": GameManager.room_id})
	_http_post(url, body, func(data: Dictionary):
		var dice  = int(data.get("dice", 0))
		print("[NetworkManager] Dado: ", dice)
		GameManager.ProcessBackendState(data)
		OnRollResult.emit(data, dice)
		# Após rolar, pedir peças movíveis
		get_movable()
	)

## Mover uma peça (índice 0-3)
func move_piece(piece_index: int) -> void:
	print("[NetworkManager] A mover peça ", piece_index)
	var url  = GameManager.backend_url + "/api/game/move"
	var body = JSON.stringify({
		"room_id": GameManager.room_id,
		"piece":   piece_index
	})
	_http_post(url, body, func(data: Dictionary):
		GameManager.ProcessBackendState(data)
		OnMoveResult.emit(data)
	)

## Pedir quais peças podem mover-se
func get_movable() -> void:
	var url  = GameManager.backend_url + "/api/game/movable"
	var body = JSON.stringify({"room_id": GameManager.room_id})
	_http_post(url, body, func(data: Dictionary):
		var movable = data.get("movable", [])
		var dice    = int(data.get("dice", 0))
		OnMovableResult.emit(movable, dice)
	)

## Abandonar o jogo
func leave_game() -> void:
	var url  = GameManager.backend_url + "/api/game/leave"
	var body = JSON.stringify({"room_id": GameManager.room_id})
	_http_post(url, body, func(_data): print("[NetworkManager] Jogo abandonado"))

## Enviar mensagem de chat
func send_chat(message: String) -> void:
	var url  = GameManager.backend_url + "/api/game/chat"
	var body = JSON.stringify({
		"room_id": GameManager.room_id,
		"message": message
	})
	_http_post(url, body, func(_data): pass)

# ════════════════════════════════════════════════════════════════
#  HTTP helpers
# ════════════════════════════════════════════════════════════════

func _http_post(url: String, body: String, callback: Callable) -> void:
	var http = HTTPRequest.new()
	add_child(http)
	_pending_requests.append(http)

	var headers = [
		"Content-Type: application/json",
		"Accept: application/json",
	]

	# Em HTML5, o cookie de sessão é enviado automaticamente pelo browser
	# Em desktop (teste), adicionar manualmente se disponível
	if not OS.has_feature("web") and GameManager.session_cookie != "":
		headers.append("Cookie: " + GameManager.session_cookie)

	http.request_completed.connect(func(result, code, _h, body_bytes):
		_on_request_done(http, result, code, body_bytes, callback)
	)

	var err = http.request(url, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		push_error("[NetworkManager] Erro HTTP POST: " + str(err))
		OnNetworkError.emit("Erro de ligação.")
		http.queue_free()
		_pending_requests.erase(http)

func _http_get(url: String, callback: Callable) -> void:
	var http = HTTPRequest.new()
	add_child(http)
	_pending_requests.append(http)

	var headers = ["Accept: application/json"]
	if not OS.has_feature("web") and GameManager.session_cookie != "":
		headers.append("Cookie: " + GameManager.session_cookie)

	http.request_completed.connect(func(result, code, _h, body_bytes):
		_on_request_done(http, result, code, body_bytes, callback)
	)

	var err = http.request(url, headers, HTTPClient.METHOD_GET)
	if err != OK:
		push_error("[NetworkManager] Erro HTTP GET: " + str(err))
		OnNetworkError.emit("Erro de ligação.")
		http.queue_free()
		_pending_requests.erase(http)

func _on_request_done(http: HTTPRequest, result: int, code: int,
					   body_bytes: PackedByteArray, callback: Callable) -> void:
	_pending_requests.erase(http)
	http.queue_free()

	if result != HTTPRequest.RESULT_SUCCESS:
		push_error("[NetworkManager] Pedido falhou: " + str(result))
		OnNetworkError.emit("Erro de ligação ao servidor.")
		return

	var body_str = body_bytes.get_string_from_utf8()
	var json     = JSON.new()
	if json.parse(body_str) != OK:
		push_error("[NetworkManager] JSON inválido: " + body_str)
		OnNetworkError.emit("Resposta inválida do servidor.")
		return

	var data = json.get_data()

	if code < 200 or code >= 300:
		var err_msg = data.get("error", "Erro " + str(code))
		push_error("[NetworkManager] Erro HTTP " + str(code) + ": " + err_msg)
		OnNetworkError.emit(err_msg)
		return

	callback.call(data)
