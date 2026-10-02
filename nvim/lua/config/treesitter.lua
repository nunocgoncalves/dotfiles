-- ---------------------------------------------------------------------------
-- Workaround: Neovim 0.12 changed query directive captures from a single TSNode
-- to a TSNode[] array, but nvim-treesitter's master branch still passes that
-- array straight to vim.treesitter.get_node_text(), which fails with
-- "attempt to call method 'range' (a nil value)".
--
-- It fires while resolving markdown fence injections, so any markdown file
-- containing a code block spams errors on open (both from render-markdown and
-- from the treesitter decoration provider).
--
-- Re-register the directive with an array-aware implementation. Remove this
-- once nvim-treesitter ships a fix or we move to its `main` branch.
vim.treesitter.query.add_directive(
  'set-lang-from-info-string!',
  function(match, _, bufnr, pred, metadata)
    local capture = match[pred[2]]
    if not capture then return end

    -- Older Neovim gave a single node; 0.12 gives a list of nodes.
    local node = capture
    if type(capture.range) ~= 'function' then
      node = capture[1]
      if not node or type(node.range) ~= 'function' then return end
    end

    local alias = vim.treesitter.get_node_text(node, bufnr):lower()
    metadata['injection.language'] = vim.filetype.match { filename = 'a.' .. alias } or alias
  end,
  { force = true }
)

-- [[ Configure Treesitter ]]
-- See `:help nvim-treesitter`
require('nvim-treesitter.configs').setup {
  -- Add languages to be installed here that you want installed for treesitter
  ensure_installed = {
    'go', 'lua', 'python', 'typescript', 'regex',
    'bash', 'markdown', 'markdown_inline', 'sql', 'hcl', 'terraform',
    'html', 'css', 'javascript', 'yaml', 'json', 'toml',
  },

  highlight = { enable = true },
  indent = { enable = true },
  incremental_selection = {
    enable = true,
    keymaps = {
      init_selection = '<c-space>',
      node_incremental = '<c-space>',
      scope_incremental = '<c-s>',
      node_decremental = '<c-backspace>',
    },
  },
  textobjects = {
    select = {
      enable = true,
      lookahead = true, -- Automatically jump forward to textobj, similar to targets.vim
      keymaps = {
        -- You can use the capture groups defined in textobjects.scm
        ['aa'] = '@parameter.outer',
        ['ia'] = '@parameter.inner',
        ['af'] = '@function.outer',
        ['if'] = '@function.inner',
        ['ac'] = '@class.outer',
        ['ic'] = '@class.inner',
        ['ii'] = '@conditional.inner',
        ['ai'] = '@conditional.outer',
        ['il'] = '@loop.inner',
        ['al'] = '@loop.outer',
        ['at'] = '@comment.outer',
      },
    },
    move = {
      enable = true,
      set_jumps = true, -- whether to set jumps in the jumplist
      goto_next_start = {
        [']f'] = '@function.outer',
        [']]'] = '@class.outer',
      },
      goto_next_end = {
        [']F'] = '@function.outer',
        [']['] = '@class.outer',
      },
      goto_previous_start = {
        ['[f'] = '@function.outer',
        ['[['] = '@class.outer',
      },
      goto_previous_end = {
        ['[F'] = '@function.outer',
        ['[]'] = '@class.outer',
      },
    },
    swap = {
      enable = true,
      swap_next = {
        ['<leader>a'] = '@parameter.inner',
      },
      swap_previous = {
        ['<leader>A'] = '@parameter.inner',
      },
    },
  },
}

