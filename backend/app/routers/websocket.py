from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.routers.auth import get_current_user_ws
from app.services.websocket import manager

router = APIRouter(prefix="/api/ws", tags=["websocket"])


@router.websocket("/")
async def websocket_endpoint(websocket: WebSocket, user_id: int = Depends(get_current_user_ws)):
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Receive and echo heartbeat messages
            data = await websocket.receive_text()
            message = {"type": "pong", "data": data}
            await websocket.send_json(message)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception:
        manager.disconnect(websocket, user_id)
