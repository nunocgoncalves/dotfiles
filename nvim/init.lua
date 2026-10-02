-- Editor settings are applied first, then keymaps, then autocmds, so that
-- everything loaded afterwards can rely on them being set.
require('options')
require('keymaps')
require('misc')            -- autocmds (highlight on yank)

-- Plugin declarations come before the per-plugin configuration below, so that
-- lazy.nvim knows about every plugin before those files require() them.
require('plugins.lazy')

require('plugins.misc')    -- Comment.nvim, go.nvim
require('plugins.lualine')
require('plugins.gitsigns')
require('plugins.tele')
require('plugins.treesitter')
require('plugins.lsp')
require('plugins.dap')
require('plugins.trouble')
require('plugins.neogit')
require('plugins.obsidian')
require('plugins.codesnap')
require('plugins.swagger-preview')
-- vim: ts=8 sts=2 sw=2 et
