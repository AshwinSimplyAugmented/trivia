from flask import Blueprint, request, send_from_directory, jsonify
import os
from models import Lobby, Player

def create_api_routes(app):
    """Create and register API routes"""

    api = Blueprint('api', __name__)

    @api.route('/api/reconnect', methods=['POST'])
    def reconnect():
        """HTTP endpoint for player/host reconnection"""
        data = request.json
        session_id = data.get('sessionId')
        lobby_code = data.get('lobbyCode')

        if not session_id or not lobby_code:
            return jsonify({'success': False, 'message': 'Missing sessionId or lobbyCode'}), 400

        # Check if lobby exists
        lobby = Lobby.query.filter_by(code=lobby_code).first()
        if not lobby:
            return jsonify({'success': False, 'message': 'Lobby not found'}), 404

        # Check if user is the host
        if lobby.host_session_id == session_id:
            players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=lobby_code).all()]
            return jsonify({
                'success': True,
                'role': 'host',
                'lobbyCode': lobby_code,
                'status': lobby.status,
                'players': players_list
            })

        # Check if user is a player
        player = Player.query.filter_by(session_id=session_id, lobby_code=lobby_code).first()
        if player:
            players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=lobby_code).all()]
            return jsonify({
                'success': True,
                'role': 'player',
                'lobbyCode': lobby_code,
                'displayName': player.display_name,
                'status': lobby.status,
                'players': players_list
            })

        return jsonify({'success': False, 'message': 'Session not found in this lobby'}), 404

    @api.route('/api/theme', methods=['GET'])
    def get_theme():
        """Get the current theme from environment variable"""
        theme = os.getenv('THEME', 'standard')
        return jsonify({'theme': theme})

    # Enhanced asset-manifest.json route with cache control
    @api.route('/asset-manifest.json')
    def serve_manifest():
        response = send_from_directory(app.static_folder, 'asset-manifest.json')
        # Add cache control headers to ensure latest version is always used
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response

    # Development-only route for hot reloading
    @api.route('/<path:filename>.hot-update.json')
    def hot_update_json(filename):
        """Handles hot-update requests during development"""
        print(f"Hot-update request received for: {filename}")
        return jsonify({"message": "Hot-update not handled here"}), 200

    # Static files route to handle CSS and JS files properly
    @api.route('/static/<path:filepath>')
    def serve_static_files(filepath):
        print(f"Attempting to serve static file from: {filepath}")
        try:
            response = send_from_directory(os.path.join(app.static_folder, 'static'), filepath)
            # Set proper MIME types for different file types
            if filepath.endswith('.css'):
                response.headers['Content-Type'] = 'text/css'
            elif filepath.endswith('.js'):
                response.headers['Content-Type'] = 'application/javascript'
            return response
        except Exception as e:
            print(f"Error serving static file: {e}")
            return str(e), 404

    # Main application route handler (catch-all for React routing)
    @api.route('/', defaults={'path': ''})
    @api.route('/<path:path>')
    def serve(path):
        """
        Main route handler that serves the React application and other static files.
        This acts as a catch-all route for any unmatched paths.
        """
        try:
            if path and os.path.exists(os.path.join(app.static_folder, path)):
                print(f"Serving static file: {path}")
                return send_from_directory(app.static_folder, path)
            else:
                print("Serving default file: index.html")
                return send_from_directory(app.static_folder, 'index.html')
        except Exception as e:
            print(f"Error in serving file: {path}, Error: {e}")
            return "An error occurred", 500

    # Register blueprint
    app.register_blueprint(api)
