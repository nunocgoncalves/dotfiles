-- Editor settings first, then keymaps, then autocmds, so anything loaded
-- afterwards can rely on them being set.
require('options')
require('keymaps')
require('misc')            -- autocmds (highlight on yank)

-- Plugin declarations (lazy.nvim). Each plugin's trigger and config live in
-- lua/plugins/lazy.lua, and larger config bodies beside this file are loaded
-- by lazy.nvim only when the plugin itself loads.
require('plugins.lazy')
-- vim: ts=8 sts=2 sw=2 et
