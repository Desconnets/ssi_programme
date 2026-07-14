"""Mode audio : toujours micro (playlist archivée dans archive/playlist-mode/)."""


def get_audio_input_mode() -> str:
    """Retourne toujours 'micro' — la playlist est désactivée."""
    return 'micro'
