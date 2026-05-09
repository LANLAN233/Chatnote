import datetime
import json
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.schemas.ai_progress import AiProgressEvent, AiProgressStage


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}
        self._operation_events: dict[str, AiProgressEvent] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, message: dict[str, Any]):
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            
            # Remove disconnected clients
            for conn in disconnected:
                self.active_connections[user_id].remove(conn)

    async def broadcast(self, message: dict[str, Any]):
        for user_id in self.active_connections:
            await self.send_to_user(user_id, message)

    async def broadcast_note_created(self, user_id: int, note_data: dict[str, Any]):
        await self.send_to_user(user_id, {
            "type": "note_created",
            "data": note_data,
            "timestamp": note_data.get("created_at")
        })

    async def broadcast_note_updated(self, user_id: int, note_data: dict[str, Any]):
        await self.send_to_user(user_id, {
            "type": "note_updated",
            "data": note_data,
            "timestamp": note_data.get("updated_at")
        })

    async def broadcast_note_deleted(self, user_id: int, note_id: int):
        await self.send_to_user(user_id, {
            "type": "note_deleted",
            "data": {"id": note_id},
            "timestamp": None
        })

    async def broadcast_schedule_reminder(self, user_id: int, schedule_data: dict[str, Any]):
        await self.send_to_user(user_id, {
            "type": "schedule_reminder",
            "data": schedule_data,
            "timestamp": schedule_data.get("start_time")
        })

    async def broadcast_plugin_response(self, user_id: int, plugin_name: str, response: str):
        await self.send_to_user(user_id, {
            "type": "plugin_response",
            "data": {
                "plugin_name": plugin_name,
                "response": response
            },
            "timestamp": None
        })

    async def broadcast_ai_progress(
        self,
        user_id: int,
        operation_id: str,
        stage_data: AiProgressStage | AiProgressEvent,
    ):
        if isinstance(stage_data, AiProgressStage):
            existing = self._operation_events.get(operation_id)
            if existing is not None:
                existing.stages.append(stage_data)
                existing.current_stage = len(existing.stages) - 1
                if stage_data.status in ("completed", "failed"):
                    existing.overall_status = stage_data.status
                else:
                    existing.overall_status = "in_progress"
                event = existing
            else:
                event = AiProgressEvent(
                    operation_id=operation_id,
                    stages=[stage_data],
                    current_stage=0,
                )
                self._operation_events[operation_id] = event
        else:
            event = stage_data

        await self.send_to_user(user_id, {
            "type": "ai_progress",
            "data": event.model_dump(),
            "timestamp": datetime.datetime.now().isoformat(),
        })

    def cleanup_operation(self, operation_id: str):
        """Remove accumulated operation data after completion."""
        self._operation_events.pop(operation_id, None)


manager = ConnectionManager()
