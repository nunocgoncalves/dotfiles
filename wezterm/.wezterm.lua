local wezterm = require 'wezterm'

return {
    color_scheme = 'Catppuccin Mocha',
    enable_tab_bar = false,
    font_size = 16.0,
    font = wezterm.font('JetBrains Mono'),
    macos_window_background_blur = 30,
    window_background_opacity = 1.0,
    window_decorations = 'RESIZE',
    mouse_bindings = {
        {
            event = { Up = { streak = 1, button = 'Left' } },
            mods = 'CTRL',
            action = wezterm.action.OpenLinkAtMouseCursor,
        },
    },
    keys = {
        {
            key = "LeftArrow",
            mods = "ALT",
            action = wezterm.action.SendString "\x1bb"
        },
        {
            key = "RightArrow",
            mods = "ALT",
            action = wezterm.action.SendString "\x1bf"
        },
    },
    -- Ensure Option key is treated as Alt
    send_composed_key_when_left_alt_is_pressed = false,
    send_composed_key_when_right_alt_is_pressed = false,
}
