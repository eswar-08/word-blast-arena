import asyncio
import json
import logging
import os
import random
import string
import time
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("WordBlastServer")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_FILE = os.path.join(BASE_DIR, "words.txt")

# Load dictionary
VALID_WORDS = set()
EASY_SYLLABLES = []
NORMAL_SYLLABLES = []
HARD_SYLLABLES = []

MIND_MELD_CATEGORIES = [
    "A pizza topping",
    "A superhero with a cape",
    "Something in your refrigerator right now",
    "A movie genre",
    "Something you bring to the beach",
    "A breakfast cereal",
    "An animal found in a zoo",
    "A school subject",
    "A fruit that is red",
    "A popular video game",
    "Something with wheels",
    "A holiday in December or October",
    "A musical instrument",
    "Something with buttons",
    "A place to go on a first date",
    "Something that flies in the sky",
    "An ice cream flavor other than vanilla",
    "A job that wears a uniform",
    "Something in a pencil case",
    "A mythical creature",
    "A sport played with a ball",
    "Something sticky",
    "A country in Europe",
    "Something very loud",
    "A green vegetable",
    "An app on your phone's home screen"
]

def load_words():
    global VALID_WORDS, EASY_SYLLABLES, NORMAL_SYLLABLES, HARD_SYLLABLES
    if os.path.exists(WORDS_FILE):
        with open(WORDS_FILE, "r", encoding="utf-8") as f:
            VALID_WORDS = {line.strip().lower() for line in f if len(line.strip()) >= 2}
        logger.info(f"Loaded {len(VALID_WORDS)} words from {WORDS_FILE}")
    else:
        # Fallback starter vocabulary
        VALID_WORDS = {"apple", "banana", "cat", "dog", "elephant", "fire", "game", "house", "internet", "jungle", "kite", "lemon", "monster", "ninja", "orange", "planet", "queen", "rocket", "star", "tiger", "umbrella", "volcano", "water", "xray", "yellow", "zebra"}
        logger.warning("words.txt not found, using minimal fallback set.")

    # Precompute syllable distributions
    syllable_counts_2 = {}
    syllable_counts_3 = {}

    for word in VALID_WORDS:
        if len(word) < 3:
            continue
        # 2-letter combos
        for i in range(len(word) - 1):
            s2 = word[i:i+2]
            if s2.isalpha():
                syllable_counts_2[s2] = syllable_counts_2.get(s2, 0) + 1
        # 3-letter combos
        for i in range(len(word) - 2):
            s3 = word[i:i+3]
            if s3.isalpha():
                syllable_counts_3[s3] = syllable_counts_3.get(s3, 0) + 1

    # Filter syllables by popularity so every prompt is solvable
    EASY_SYLLABLES = [s.upper() for s, count in syllable_counts_2.items() if count >= 100]
    NORMAL_SYLLABLES = [s.upper() for s, count in syllable_counts_2.items() if 40 <= count < 100] + \
                       [s.upper() for s, count in syllable_counts_3.items() if count >= 40]
    HARD_SYLLABLES = [s.upper() for s, count in syllable_counts_3.items() if 15 <= count < 40]

    if not EASY_SYLLABLES:
        EASY_SYLLABLES = ["TH", "IN", "ER", "RE", "AN", "ON", "AT", "EN", "ND", "TI", "ES", "OR", "TE", "OF", "ED"]
    if not NORMAL_SYLLABLES:
        NORMAL_SYLLABLES = ["CON", "PRO", "ING", "TER", "CAT", "ION", "VER", "FOR", "MAN", "DAY", "OUT", "CAR", "AIR", "WAR"]
    if not HARD_SYLLABLES:
        HARD_SYLLABLES = ["PSY", "QUE", "SPH", "GHT", "FOX", "ZOO", "JAZ", "RHY", "OAK", "LYM", "IXT"]

    logger.info(f"Syllable pools ready: {len(EASY_SYLLABLES)} Easy, {len(NORMAL_SYLLABLES)} Normal, {len(HARD_SYLLABLES)} Hard")

load_words()

# Active game rooms: code -> Room instance
ROOMS = {}

def generate_room_code():
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(100):
        code = "".join(random.choice(chars) for _ in range(4))
        if code not in ROOMS:
            return code
    return "".join(random.choice(chars) for _ in range(6))

class Player:
    def __init__(self, player_id, name, avatar, ws, is_host=False):
        self.id = player_id
        self.name = name
        self.avatar = avatar
        self.ws = ws
        self.is_host = is_host
        self.lives = 3
        self.score = 0
        self.words_submitted = 0
        self.streak = 0
        self.connected = True

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "avatar": self.avatar,
            "is_host": self.is_host,
            "lives": self.lives,
            "score": self.score,
            "words_submitted": self.words_submitted,
            "streak": self.streak,
            "connected": self.connected,
            "is_alive": self.lives > 0,
        }

class GameRoom:
    def __init__(self, code):
        self.code = code
        self.players = {}  # player_id -> Player
        self.state = "LOBBY"  # LOBBY, PLAYING, ROUND_OVER, GAME_OVER
        self.game_mode = "bomb"  # 'bomb' or 'mind_meld'
        self.settings = {
            "bomb_timer": 10,  # 7, 10, or 15 seconds
            "starting_lives": 3,
            "difficulty": "normal",  # easy, normal, hard
        }
        # Bomb Game state
        self.turn_order = []
        self.turn_index = 0
        self.current_player_id = None
        self.current_syllable = ""
        self.used_words = set()
        self.turn_start_time = 0
        self.timer_task = None
        self.winner = None
        self.last_event = None

        # Mind Meld state
        self.mind_meld_prompt = ""
        self.mind_meld_submissions = {}  # player_id -> word
        self.mind_meld_results = None

    def add_player(self, player_id, name, avatar, ws):
        is_host = len(self.players) == 0
        player = Player(player_id, name, avatar, ws, is_host=is_host)
        player.lives = self.settings["starting_lives"]
        self.players[player_id] = player
        return player

    def remove_player(self, player_id):
        if player_id in self.players:
            p = self.players.pop(player_id)
            if p.is_host and self.players:
                # Migrate host
                next_host = next(iter(self.players.values()))
                next_host.is_host = True
            
            # If in game and currently this player's turn, advance immediately
            if self.state == "PLAYING" and self.game_mode == "bomb":
                if player_id in self.turn_order:
                    self.turn_order.remove(player_id)
                if self.current_player_id == player_id:
                    asyncio.create_task(self.handle_turn_timeout(reason="disconnect"))
                self.check_game_over()
            elif self.state == "PLAYING" and self.game_mode == "mind_meld":
                self.check_mind_meld_completion()

    def get_syllable(self):
        diff = self.settings["difficulty"]
        if diff == "easy":
            return random.choice(EASY_SYLLABLES)
        elif diff == "hard":
            return random.choice(HARD_SYLLABLES)
        else:
            return random.choice(NORMAL_SYLLABLES)

    async def broadcast(self, msg_dict):
        text = json.dumps(msg_dict)
        for player in list(self.players.values()):
            if player.connected and player.ws is not None and not player.ws.closed:
                try:
                    await player.ws.send_str(text)
                except Exception as e:
                    logger.debug(f"Broadcast error to {player.id}: {e}")

    async def broadcast_state(self):
        data = {
            "type": "state_update",
            "room_code": self.code,
            "state": self.state,
            "game_mode": self.game_mode,
            "settings": self.settings,
            "players": [p.to_dict() for p in self.players.values()],
            "current_player_id": self.current_player_id,
            "current_syllable": self.current_syllable,
            "turn_time_total": self.settings["bomb_timer"],
            "turn_start_time": self.turn_start_time,
            "used_words_count": len(self.used_words),
            "winner": self.winner,
            "last_event": self.last_event,
            "mind_meld_prompt": self.mind_meld_prompt,
            "mind_meld_submitted_ids": list(self.mind_meld_submissions.keys()),
            "mind_meld_results": self.mind_meld_results
        }
        await self.broadcast(data)

    async def start_bomb_game(self):
        self.state = "PLAYING"
        self.game_mode = "bomb"
        self.used_words = set()
        self.winner = None
        self.last_event = {"type": "game_started", "message": "The Bomb is primed! Think fast!"}

        # Reset player lives
        for p in self.players.values():
            p.lives = self.settings["starting_lives"]
            p.score = 0
            p.words_submitted = 0
            p.streak = 0

        # Create turn order
        self.turn_order = [p.id for p in self.players.values() if p.lives > 0]
        random.shuffle(self.turn_order)
        self.turn_index = 0
        await self.next_turn()

    async def next_turn(self):
        if self.timer_task and not self.timer_task.done():
            self.timer_task.cancel()

        # Check win condition
        alive_players = [p for p in self.players.values() if p.lives > 0]
        if len(alive_players) <= 1:
            self.state = "GAME_OVER"
            self.winner = alive_players[0].to_dict() if alive_players else None
            self.last_event = {
                "type": "game_won",
                "message": f"👑 {self.winner['name']} won the Word Blast Royale!" if self.winner else "Game Over!"
            }
            await self.broadcast_state()
            return

        # Advance to next living player
        attempts = 0
        while attempts < len(self.turn_order) + 2:
            self.turn_index = (self.turn_index + 1) % len(self.turn_order)
            pid = self.turn_order[self.turn_index]
            if pid in self.players and self.players[pid].lives > 0:
                self.current_player_id = pid
                break
            attempts += 1

        self.current_syllable = self.get_syllable()
        self.turn_start_time = time.time()
        await self.broadcast_state()

        # Start timer task
        self.timer_task = asyncio.create_task(self.run_turn_timer())

    async def run_turn_timer(self):
        try:
            duration = self.settings["bomb_timer"]
            await asyncio.sleep(duration)
            # If not cancelled, player timed out!
            await self.handle_turn_timeout(reason="timeout")
        except asyncio.CancelledError:
            pass

    async def handle_turn_timeout(self, reason="timeout"):
        if self.state != "PLAYING" or self.game_mode != "bomb":
            return
        
        pid = self.current_player_id
        if pid in self.players:
            p = self.players[pid]
            p.lives = max(0, p.lives - 1)
            p.streak = 0
            is_eliminated = p.lives == 0

            self.last_event = {
                "type": "explosion",
                "player_id": p.id,
                "player_name": p.name,
                "reason": reason,
                "is_eliminated": is_eliminated,
                "syllable": self.current_syllable,
                "message": f"💥 BOOM! {p.name} ran out of time with '{self.current_syllable}'!" + (" (ELIMINATED!)" if is_eliminated else "")
            }

        await self.next_turn()

    async def submit_word(self, player_id, raw_word):
        if self.state != "PLAYING" or self.game_mode != "bomb":
            return {"success": False, "error": "Game is not active"}

        if player_id != self.current_player_id:
            return {"success": False, "error": "It's not your turn!"}

        word = raw_word.strip().lower()

        # Check empty
        if not word:
            return {"success": False, "error": "Enter a word!"}

        # Check contains syllable
        syllable = self.current_syllable.lower()
        if syllable not in word:
            return {"success": False, "error": f"Must contain '{self.current_syllable}'!"}

        # Check already used
        if word in self.used_words:
            return {"success": False, "error": f"'{word.upper()}' was already used this round!"}

        # Check dictionary
        if word not in VALID_WORDS:
            return {"success": False, "error": f"'{word.upper()}' is not in the dictionary!"}

        # Valid word!
        player = self.players[player_id]
        self.used_words.add(word)
        player.words_submitted += 1
        player.streak += 1

        # Calculate score: base 100 + word length bonus + speed bonus
        elapsed = time.time() - self.turn_start_time
        remaining = max(0, self.settings["bomb_timer"] - elapsed)
        speed_bonus = int(remaining * 25)
        length_bonus = max(0, (len(word) - 4) * 20)
        streak_bonus = player.streak * 15
        total_points = 100 + speed_bonus + length_bonus + streak_bonus

        player.score += total_points

        self.last_event = {
            "type": "word_success",
            "player_id": player.id,
            "player_name": player.name,
            "word": word.upper(),
            "syllable": self.current_syllable,
            "points": total_points,
            "message": f"✨ {player.name} answered '{word.upper()}' (+{total_points} pts)!"
        }

        # Move to next turn immediately
        await self.next_turn()
        return {"success": True}

    # --- Mind Meld Mode ---
    async def start_mind_meld_game(self):
        self.state = "PLAYING"
        self.game_mode = "mind_meld"
        self.mind_meld_prompt = random.choice(MIND_MELD_CATEGORIES)
        self.mind_meld_submissions = {}
        self.mind_meld_results = None
        self.last_event = {
            "type": "mind_meld_started",
            "prompt": self.mind_meld_prompt,
            "message": f"🔮 Mind Meld: Type what comes to mind for '{self.mind_meld_prompt}'!"
        }
        await self.broadcast_state()

        # 20 second timer for mind meld
        if self.timer_task and not self.timer_task.done():
            self.timer_task.cancel()
        self.timer_task = asyncio.create_task(self.run_mind_meld_timer(20))

    async def run_mind_meld_timer(self, duration):
        try:
            await asyncio.sleep(duration)
            await self.resolve_mind_meld()
        except asyncio.CancelledError:
            pass

    async def submit_mind_meld(self, player_id, answer):
        if self.state != "PLAYING" or self.game_mode != "mind_meld":
            return {"success": False, "error": "Mind Meld not active"}

        clean = answer.strip().lower()
        if not clean:
            return {"success": False, "error": "Enter an answer!"}

        self.mind_meld_submissions[player_id] = clean
        await self.broadcast_state()

        # Check if all players submitted
        alive_players = [p for p in self.players.values() if p.connected]
        if len(self.mind_meld_submissions) >= len(alive_players):
            if self.timer_task and not self.timer_task.done():
                self.timer_task.cancel()
            await self.resolve_mind_meld()

        return {"success": True}

    def check_mind_meld_completion(self):
        alive_players = [p for p in self.players.values() if p.connected]
        if len(self.mind_meld_submissions) >= len(alive_players) and len(alive_players) > 0:
            asyncio.create_task(self.resolve_mind_meld())

    async def resolve_mind_meld(self):
        # Group submissions to find matches
        word_groups = {}
        for pid, ans in self.mind_meld_submissions.items():
            if ans not in word_groups:
                word_groups[ans] = []
            word_groups[ans].append(pid)

        results = []
        matches_found = 0
        for ans, pids in word_groups.items():
            p_names = [self.players[p].name for p in pids if p in self.players]
            is_match = len(pids) >= 2
            if is_match:
                matches_found += 1
                for pid in pids:
                    if pid in self.players:
                        self.players[pid].score += 250
            results.append({
                "word": ans.upper(),
                "player_names": p_names,
                "is_match": is_match,
                "match_count": len(pids)
            })

        self.mind_meld_results = {
            "results": results,
            "matches_found": matches_found,
            "prompt": self.mind_meld_prompt
        }
        self.state = "ROUND_OVER"
        self.last_event = {
            "type": "mind_meld_resolved",
            "matches_found": matches_found,
            "message": f"🎉 Mind Meld Complete! {matches_found} telepathic match{'es' if matches_found != 1 else ''}!"
        }
        await self.broadcast_state()

    def check_game_over(self):
        alive = [p for p in self.players.values() if p.lives > 0]
        if len(alive) <= 1 and self.state == "PLAYING":
            self.state = "GAME_OVER"
            self.winner = alive[0].to_dict() if alive else None
            asyncio.create_task(self.broadcast_state())

# --- WebSocket & HTTP Handlers ---

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    current_room = None
    current_player_id = None

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                action = data.get("action")

                if action == "create_room":
                    code = generate_room_code()
                    room = GameRoom(code)
                    ROOMS[code] = room
                    name = data.get("name", "Player 1")
                    avatar = data.get("avatar", "🚀")
                    player_id = "".join(random.choice(string.ascii_letters + string.digits) for _ in range(8))
                    
                    player = room.add_player(player_id, name, avatar, ws)
                    current_room = room
                    current_player_id = player_id

                    await ws.send_str(json.dumps({
                        "type": "room_joined",
                        "room_code": code,
                        "player_id": player_id,
                        "is_host": True
                    }))
                    await room.broadcast_state()
                    logger.info(f"Room {code} created by {name} ({player_id})")

                elif action == "join_room":
                    code = data.get("room_code", "").strip().upper()
                    if code not in ROOMS:
                        await ws.send_str(json.dumps({
                            "type": "error",
                            "message": f"Room '{code}' does not exist! Please check the code."
                        }))
                        continue

                    room = ROOMS[code]
                    if len(room.players) >= 16:
                        await ws.send_str(json.dumps({
                            "type": "error",
                            "message": "Room is full (max 16 players)!"
                        }))
                        continue

                    name = data.get("name", f"Player {len(room.players)+1}")
                    avatar = data.get("avatar", "👾")
                    player_id = "".join(random.choice(string.ascii_letters + string.digits) for _ in range(8))

                    player = room.add_player(player_id, name, avatar, ws)
                    current_room = room
                    current_player_id = player_id

                    await ws.send_str(json.dumps({
                        "type": "room_joined",
                        "room_code": code,
                        "player_id": player_id,
                        "is_host": player.is_host
                    }))
                    await room.broadcast_state()
                    logger.info(f"Player {name} ({player_id}) joined Room {code}")

                elif action == "update_settings":
                    if current_room and current_player_id:
                        p = current_room.players.get(current_player_id)
                        if p and p.is_host:
                            settings = data.get("settings", {})
                            current_room.settings.update(settings)
                            # update player starting lives if in lobby
                            if current_room.state == "LOBBY":
                                for pl in current_room.players.values():
                                    pl.lives = current_room.settings["starting_lives"]
                            await current_room.broadcast_state()

                elif action == "start_game":
                    if current_room and current_player_id:
                        p = current_room.players.get(current_player_id)
                        if p and p.is_host:
                            mode = data.get("mode", "bomb")
                            if mode == "mind_meld":
                                await current_room.start_mind_meld_game()
                            else:
                                await current_room.start_bomb_game()

                elif action == "submit_word":
                    if current_room and current_player_id:
                        word = data.get("word", "")
                        res = await current_room.submit_word(current_player_id, word)
                        if not res["success"]:
                            await ws.send_str(json.dumps({
                                "type": "word_rejected",
                                "error": res["error"]
                            }))

                elif action == "submit_mind_meld":
                    if current_room and current_player_id:
                        answer = data.get("answer", "")
                        res = await current_room.submit_mind_meld(current_player_id, answer)
                        if not res["success"]:
                            await ws.send_str(json.dumps({
                                "type": "word_rejected",
                                "error": res["error"]
                            }))

                elif action == "send_reaction":
                    if current_room and current_player_id:
                        emoji = data.get("emoji", "🔥")
                        p = current_room.players.get(current_player_id)
                        name = p.name if p else "Someone"
                        await current_room.broadcast({
                            "type": "reaction",
                            "emoji": emoji,
                            "sender_name": name
                        })

                elif action == "return_to_lobby":
                    if current_room and current_player_id:
                        p = current_room.players.get(current_player_id)
                        if p and p.is_host:
                            if current_room.timer_task and not current_room.timer_task.done():
                                current_room.timer_task.cancel()
                            current_room.state = "LOBBY"
                            for pl in current_room.players.values():
                                pl.lives = current_room.settings["starting_lives"]
                                pl.score = 0
                                pl.streak = 0
                            await current_room.broadcast_state()

                elif action == "ping":
                    await ws.send_str(json.dumps({"type": "pong"}))

            elif msg.type == web.WSMsgType.ERROR:
                logger.error(f"WS error: {ws.exception()}")

    finally:
        if current_room and current_player_id:
            logger.info(f"Player {current_player_id} disconnected from Room {current_room.code}")
            current_room.remove_player(current_player_id)
            if len(current_room.players) == 0:
                if current_room.timer_task and not current_room.timer_task.done():
                    current_room.timer_task.cancel()
                if current_room.code in ROOMS:
                    del ROOMS[current_room.code]
                    logger.info(f"Room {current_room.code} destroyed (empty)")
            else:
                await current_room.broadcast_state()

    return ws

async def index_handler(request):
    return web.FileResponse(os.path.join(BASE_DIR, "public", "index.html"))

async def init_app():
    app = web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", websocket_handler)
    public_path = os.path.join(BASE_DIR, "public")
    app.router.add_static("/", public_path, show_index=False)
    return app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"🚀 Word Blast Arena running at http://localhost:{port}")
    app = init_app()
    web.run_app(app, host="0.0.0.0", port=port)
