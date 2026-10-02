-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Required by the notification UI
vim.o.termguicolors = true

-- ---------------------------------------------------------------------------
-- Every plugin declares its own lazy-load trigger and config here, so the
-- config only runs when the plugin actually loads. Larger config bodies live
-- in lua/plugins/<name>.lua and are required from the `config` function.
-- ---------------------------------------------------------------------------
require('lazy').setup({
  -- ── theme ──────────────────────────────────────────────────────────────
  {
    "catppuccin/nvim",
    name = "catppuccin",
    priority = 1000, -- load first so there is no theme flash
    config = function()
      vim.cmd.colorscheme("catppuccin-latte")
    end,
  },

  -- ── UI ─────────────────────────────────────────────────────────────────
  {
    'nvim-lualine/lualine.nvim',
    event = 'VeryLazy',
    config = function() require('config.lualine') end,
  },
  {
    "folke/noice.nvim",
    event = "VeryLazy",
    config = function()
      require("noice").setup({
        routes = {
          {
            filter = {
              event = 'msg_show',
              any = {
                { find = '%d+L, %d+B' },
                { find = '; after #%d+' },
                { find = '; before #%d+' },
                { find = '%d fewer lines' },
                { find = '%d more lines' },
              },
            },
            opts = { skip = true },
          }
        },
      })
    end,
    dependencies = {
      "MunifTanjim/nui.nvim",
      "rcarriga/nvim-notify",
    }
  },
  { 'onsails/lspkind.nvim', lazy = true },
  { "lukas-reineke/indent-blankline.nvim", event = { "BufReadPre", "BufNewFile" }, main = "ibl", opts = {} },
  {
    "folke/trouble.nvim",
    cmd = "Trouble",
    dependencies = "nvim-tree/nvim-web-devicons",
    config = function() require('config.trouble') end,
  },
  {
    "folke/todo-comments.nvim",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = "nvim-lua/plenary.nvim",
    config = function() require("todo-comments").setup {} end,
  },
  { "folke/twilight.nvim", cmd = "Twilight" },
  {
    -- Markdown rendering — kept for the obsidian.nvim notes workflow.
    'MeanderingProgrammer/render-markdown.nvim',
    ft = { "markdown" },
  },

  -- ── editing ────────────────────────────────────────────────────────────
  { 'tpope/vim-surround', event = 'VeryLazy' },
  { 'tpope/vim-sleuth', event = { 'BufReadPre', 'BufNewFile' } },
  {
    'numToStr/Comment.nvim',
    event = 'VeryLazy',
    config = function() require('Comment').setup() end,
  },
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    config = function() require("nvim-autopairs").setup {} end,
  },

  -- ── git ────────────────────────────────────────────────────────────────
  { 'tpope/vim-fugitive', cmd = { 'Git', 'G' } },
  {
    'lewis6991/gitsigns.nvim',
    event = { 'BufReadPre', 'BufNewFile' },
    config = function() require('config.gitsigns') end,
  },
  {
    "NeogitOrg/neogit",
    cmd = "Neogit",
    dependencies = {
      "nvim-lua/plenary.nvim",         -- required
      "sindrets/diffview.nvim",        -- diff integration
      "nvim-telescope/telescope.nvim", -- optional integration
    },
    config = function() require('config.neogit') end,
  },

  -- ── fuzzy finder ───────────────────────────────────────────────────────
  {
    'nvim-telescope/telescope.nvim',
    cmd = 'Telescope',
    branch = '0.1.x',
    dependencies = { 'nvim-lua/plenary.nvim' },
    config = function() require('config.tele') end,
  },
  'nvim-telescope/telescope-symbols.nvim',
  {
    'nvim-telescope/telescope-fzf-native.nvim',
    build = 'make',
    cond = vim.fn.executable 'make' == 1,
  },
  'ThePrimeagen/git-worktree.nvim',

  -- ── LSP / completion ───────────────────────────────────────────────────
  {
    'neovim/nvim-lspconfig',
    event = { 'BufReadPre', 'BufNewFile' },
    dependencies = {
      'williamboman/mason.nvim',
      'williamboman/mason-lspconfig.nvim',
      'j-hui/fidget.nvim',
    },
    config = function() require('config.lsp') end,
  },
  {
    'hrsh7th/nvim-cmp',
    event = 'InsertEnter',
    dependencies = { 'hrsh7th/cmp-nvim-lsp', 'L3MON4D3/LuaSnip', 'saadparwaiz1/cmp_luasnip' },
  },

  -- ── treesitter ─────────────────────────────────────────────────────────
  {
    'nvim-treesitter/nvim-treesitter',
    event = { 'BufReadPost', 'BufNewFile' },
    build = function()
      pcall(require('nvim-treesitter.install').update { with_sync = true })
    end,
    dependencies = { 'nvim-treesitter/nvim-treesitter-textobjects' },
    config = function() require('config.treesitter') end,
  },

  -- ── debugging ──────────────────────────────────────────────────────────
  {
    "rcarriga/nvim-dap-ui",
    cmd = "DapUiToggle",
    dependencies = { "mfussenegger/nvim-dap", "nvim-neotest/nvim-nio" },
    config = function() require('config.dap') end,
  },
  'theHamsta/nvim-dap-virtual-text',
  'leoluz/nvim-dap-go',

  -- ── language specific ──────────────────────────────────────────────────
  {
    'ray-x/go.nvim',
    ft = 'go',
    config = function()
      -- goimports on save
      local grp = vim.api.nvim_create_augroup("GoFormat", {})
      vim.api.nvim_create_autocmd("BufWritePre", {
        pattern = "*.go",
        callback = function() require('go.format').goimport() end,
        group = grp,
      })
      require('go').setup()
    end,
  },
  {
    "epwalsh/obsidian.nvim",
    version = "*",
    ft = "markdown",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function() require('config.obsidian') end,
  },

  -- ── database ───────────────────────────────────────────────────────────
  {
    'tpope/vim-dadbod',
    lazy = true,
    dependencies = {
      'kristijanhusak/vim-dadbod-ui',
      'kristijanhusak/vim-dadbod-completion',
    },
    config = function() require("config.dadbod").setup() end,
  },

  -- ── misc ───────────────────────────────────────────────────────────────
  {
    "vinnymeller/swagger-preview.nvim",
    cmd = "SwaggerPreview",
    config = function() require('config.swagger-preview') end,
  },
  {
    "mistricky/codesnap.nvim",
    cmd = "Codesnap",
    build = "make",
    config = function() require('config.codesnap') end,
  },
  {
    "iamcco/markdown-preview.nvim",
    cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
    ft = { "markdown" },
    build = function() vim.fn["mkdp#util#install"]() end,
  },
})
