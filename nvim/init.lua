-- Editor settings first, then keymaps, then autocmds, so anything loaded
-- afterwards can rely on them being set.
require('config.options')
require('config.keymaps')
require('config.autocmds')            -- autocmds (highlight on yank)

-- Plugin declarations (lazy.nvim). Each plugin's trigger and config live in
-- lua/plugins/lazy.lua; larger config bodies live in lua/config/ and are
-- required from those config functions, so they only run when the plugin loads.
require('plugins.lazy')
-- vim: ts=8 sts=2 sw=2 et
