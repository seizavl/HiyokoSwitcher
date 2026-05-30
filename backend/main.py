from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import uvicorn
import subprocess
import sys
import pyautogui
import time
import pyperclip
import pygetwindow as gw
from pynput.keyboard import Key, Controller

keyboard = Controller()

MIN_LOGIN_WAIT_SECONDS = 8
KEY_STROKE_DELAY_SECONDS = 0.05
DEFAULT_STAY_BUTTON_X = 110
DEFAULT_STAY_BUTTON_Y = 430
DEFAULT_LOGIN_BUTTON_X = 200
DEFAULT_LOGIN_BUTTON_Y = 700


def clamp_login_wait(seconds):
    try:
        parsed = int(seconds)
    except (TypeError, ValueError):
        parsed = MIN_LOGIN_WAIT_SECONDS
    return max(parsed, MIN_LOGIN_WAIT_SECONDS)


def type_text_key_by_key(text):
    for char in str(text):
        keyboard.type(char)
        time.sleep(KEY_STROKE_DELAY_SECONDS)


def paste(text):
    pyperclip.copy(text)
    time.sleep(0.15)
    with keyboard.pressed(Key.ctrl):
        keyboard.press('v')
        keyboard.release('v')
    time.sleep(0.2)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MacroRequest(BaseModel):
    account_id: str
    password: str
    riot_client_path: str
    launch_second: int = MIN_LOGIN_WAIT_SECONDS
    extra_wait: bool = False


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ここに Python 関数を追加していく
# 例: GET /api/test/hello → {"message": "Hello from Python!"}
@app.get("/api/test/hello")
def test_hello():
    return {"message": "Hello from Python!"}


# 例: POST /api/test/echo → 送ったテキストをそのまま返す
class EchoRequest(BaseModel):
    text: str

@app.post("/api/test/echo")
def test_echo(req: EchoRequest):
    result = req.text.upper()  # ← ここに Python の処理を書く
    return {"input": req.text, "result": result}


def move_mouse_task():
    """マウスを動かす処理（ここに書く）"""
    pyautogui.FAILSAFE = True  # 画面左上にマウスを持っていくと緊急停止

    # 現在位置を取得
    start_x, start_y = pyautogui.position()

    # 右に300px、2秒かけて移動
    pyautogui.moveTo(start_x + 300, start_y, duration=1.0)
    time.sleep(0.3)

    # 下に200px移動
    pyautogui.moveTo(start_x + 300, start_y + 200, duration=1.0)
    time.sleep(0.3)

    # 元の位置に戻る
    pyautogui.moveTo(start_x, start_y, duration=1.0)

def riot_login_task(
    account_id: str,
    password: str,
    riot_client_path: str,
    launch_second: int = MIN_LOGIN_WAIT_SECONDS,
    extra_wait: bool = False,
    skip_stay: bool = False,
    stay_button_x: int = DEFAULT_STAY_BUTTON_X,
    stay_button_y: int = DEFAULT_STAY_BUTTON_Y,
    login_button_x: int = DEFAULT_LOGIN_BUTTON_X,
    login_button_y: int = DEFAULT_LOGIN_BUTTON_Y,
):
    """Riot Client にログインする処理"""
    # `cmd /c start` 経由で起動して Riot Client を Python のプロセスツリーから切り離す。
    # こうしないと Switcher 終了時の `taskkill /F /T`（backend.exe の終了処理）に
    # Riot Client まで巻き込まれて一緒に閉じてしまう。
    subprocess.Popen(
        ["cmd", "/c", "start", "", riot_client_path],
        shell=False,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    i = 0
    while True:
        process_name = "RiotClientServices.exe"
        output = subprocess.check_output(
            f'tasklist /FI "IMAGENAME eq {process_name}" /FO CSV /NH',
            shell=True, encoding="cp932"
        )

        if process_name in output:
            riot_client_windows = gw.getWindowsWithTitle('Riot Client')
            if riot_client_windows:
                wait = clamp_login_wait(launch_second) + (4 if extra_wait else 0)
                time.sleep(wait)

                riot_client_windows = gw.getWindowsWithTitle('Riot Client')
                if not riot_client_windows:
                    time.sleep(1)
                    continue

                riot_client_window = riot_client_windows[0]
                try:
                    riot_client_window.activate()
                except Exception:
                    time.sleep(1)
                    continue

                time.sleep(0.5)

                type_text_key_by_key(account_id)

                keyboard.press(Key.tab)
                keyboard.release(Key.tab)
                time.sleep(0.3)

                type_text_key_by_key(password)

                if not skip_stay:
                    staybutton_x = riot_client_window.left + stay_button_x
                    staybutton_y = riot_client_window.top + stay_button_y
                    pyautogui.click(staybutton_x, staybutton_y)

                button_x = riot_client_window.left + login_button_x
                button_y = riot_client_window.top + login_button_y
                pyautogui.click(button_x, button_y)
                break

            elif i > 20:
                break
            else:
                i += 1

        time.sleep(1)


@app.get("/api/riot/login")
def riot_login(
    account_id: str,
    password: str,
    riot_client_path: str,
    launch_second: int = MIN_LOGIN_WAIT_SECONDS,
    extra_wait: bool = False,
    stay_button_x: int = DEFAULT_STAY_BUTTON_X,
    stay_button_y: int = DEFAULT_STAY_BUTTON_Y,
    login_button_x: int = DEFAULT_LOGIN_BUTTON_X,
    login_button_y: int = DEFAULT_LOGIN_BUTTON_Y,
):
    try:
        riot_login_task(
            account_id,
            password,
            riot_client_path,
            launch_second,
            extra_wait,
            stay_button_x=stay_button_x,
            stay_button_y=stay_button_y,
            login_button_x=login_button_x,
            login_button_y=login_button_y,
        )
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/riot/macro-login")
def riot_macro_login(
    account_id: str,
    password: str,
    riot_client_path: str,
    launch_second: int = MIN_LOGIN_WAIT_SECONDS,
    login_button_x: int = DEFAULT_LOGIN_BUTTON_X,
    login_button_y: int = DEFAULT_LOGIN_BUTTON_Y,
):
    try:
        riot_login_task(
            account_id,
            password,
            riot_client_path,
            launch_second,
            skip_stay=True,
            login_button_x=login_button_x,
            login_button_y=login_button_y,
        )
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.post("/api/test/move-mouse")
def test_move_mouse(background_tasks: BackgroundTasks):
    """マウスを動かすエンドポイント（すぐ返してバックグラウンドで実行）"""
    background_tasks.add_task(move_mouse_task)
    return {"status": "started"}


@app.post("/api/macro/execute")
def execute_macro(req: MacroRequest):
    try:
        script = Path(__file__).parent / "macro.py"
        subprocess.Popen(
            [
                sys.executable, str(script),
                req.account_id,
                req.password,
                req.riot_client_path,
                str(clamp_login_wait(req.launch_second)),
                str(req.extra_wait),
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        return {"success": True}

    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
