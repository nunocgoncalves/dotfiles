-- Rex config. Reload with: rex config reload
-- Ported from ~/.config/tmux/tmux.conf: Ctrl-A prefix, same keys where Rex has the action.

-- Ctrl-A twice sends a literal Ctrl-A (start of line in the shell).
rex.bind("ctrl+a>ctrl+a", "pane.send_key", { key = "ctrl+a" })

-- Tabs (tmux windows)
rex.bind("ctrl+a>c", "client.tab.new")
rex.bind("ctrl+a>n", "client.tab.next")
rex.bind("ctrl+a>p", "client.tab.previous")
rex.bind("ctrl+a>,", "client.tab.rename")
for i = 1, 9 do
  rex.bind("ctrl+a>" .. i, "client.tab.goto", { index = i })
end

-- Panes
rex.bind("ctrl+a>shift+5", "pane.split", { direction = "right" }) -- %
rex.bind("ctrl+a>shift+'", "pane.split", { direction = "down" })  -- "
rex.bind("ctrl+a>z", "pane.zoom")
-- pane.close refuses the last pane in a tab; block.close closes it and the tab.
rex.action{
  name  = "close_pane_or_tab",
  title = "Close Pane (or Tab if Last)",
  run   = function(ctx)
    local _, err = rex.call("block.close", { session_id = ctx.session_id, block_id = ctx.block_id })
    if err ~= nil then error(err, 0) end
  end,
}
rex.bind("ctrl+a>x", "close_pane_or_tab")
rex.bind("ctrl+a>h", "pane.focus.left")
rex.bind("ctrl+a>j", "pane.focus.down")
rex.bind("ctrl+a>k", "pane.focus.up")
rex.bind("ctrl+a>l", "pane.focus.right")
rex.bind("ctrl+a>=", "pane.balance")
rex.bind("ctrl+a>shift+1", "pane.move_to_new_tab")

-- Floating shell, like tmux-floax, on prefix ctrl+p (prefix p is previous tab). One per session, labeled "float".
-- Pressed outside it: show it over the current tab (open one in this pane's
-- directory if there is none). Pressed inside it: hide it. Hiding detaches the
-- pane, so its program keeps running and comes back as you left it.
local FLOAT_LABEL = "float"
local FLOAT_BOUNDS = { 0.1, 0.1, 0.8, 0.8 }

local function find_float()
  local list, err = rex.session.list_blocks{}
  if err ~= nil then error(err, 0) end
  for _, b in ipairs(list.blocks or {}) do
    if b.label == FLOAT_LABEL then return b end
  end
end

local function cwd_of(block_id)
  local res = rex.block.call("com.superlogical.terminal", "pwd", { block_id = block_id })
  if not (res and res.pwd) then return nil end
  local path = res.pwd:gsub("^file://[^/]*", "")
  return (path:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

rex.action{
  name  = "float_toggle",
  title = "Toggle Floating Shell",
  run   = function(ctx)
    local float = find_float()
    if float and float.block_id == ctx.block_id then
      local _, err = rex.session.detach_block{ block_id = float.block_id }
      if err ~= nil then error(err, 0) end
      return
    end
    if float then
      if float.placement == "placed" then
        rex.session.detach_block{ block_id = float.block_id }
      end
      local _, err = rex.session.move_block{ block_id = float.block_id, anchor_block_id = ctx.block_id }
      if err ~= nil then error(err, 0) end
      _, err = rex.session.float_block{ block_id = float.block_id, bounds = FLOAT_BOUNDS }
      if err ~= nil then error(err, 0) end
      rex.session.focus_block{ block_id = float.block_id }
      return
    end
    local here, err = rex.session.describe_block{ block_id = ctx.block_id }
    if err ~= nil then error(err, 0) end
    local created, nerr = rex.session.new_layer{
      window_id = here.block and here.block.window_id or nil,
      bounds    = FLOAT_BOUNDS,
      focus     = true,
      layout    = rex.layout.block{
        flavor  = "com.superlogical.terminal.shell",
        options = { cwd = cwd_of(ctx.block_id) },
      },
    }
    if nerr ~= nil then error(nerr, 0) end
    rex.session.set_block_label{ block_id = created.block_ids[1], label = FLOAT_LABEL }
  end,
}
rex.bind("ctrl+a>ctrl+p", "float_toggle")
-- Float the current pane out of its split (needs 2+ panes in the tab).
rex.bind("ctrl+a>f", "pane.float")

-- Projects (replaces sessionx): ^A g picks a zoxide directory in a float and
-- opens its session, creating it if needed, with one tab running Claude.
local SHELL_FLAVOR = "com.superlogical.terminal.shell"

local function project_layout(dir)
  -- Typed into a full shell, so .zshrc's PATH applies and quitting leaves a shell.
  -- No window_label: the tab keeps Rex's own label.
  return {
    { layout = rex.layout.block{ flavor = SHELL_FLAVOR, options = { cwd = dir, initial_input = "claude\n" } } },
  }
end

rex.action{
  name  = "project_open",
  title = "Open Project Session",
  args  = { dir = "string" },
  run   = function(ctx, args)
    local dir = args.dir:gsub("/+$", "")
    local label = dir:match("([^/]+)$") or dir
    local list, err = rex.call("session.list", {})
    if err ~= nil then error(err, 0) end
    local session_id
    for _, s in ipairs(list.sessions or {}) do
      if s.label == label then session_id = s.session_id end
    end
    local window_id
    if session_id == nil then
      local created, cerr = rex.call("session.create", { label = label, initial_windows = project_layout(dir) })
      if cerr ~= nil then error(cerr, 0) end
      session_id = created.session_id
      window_id = created.initial_windows[1].window_id
    end
    rex.client.queue("session.select", { session_id = session_id, window_id = window_id })
    return { session_id = session_id }
  end,
}

rex.action{
  name  = "project_pick",
  title = "Pick Project…",
  run   = function(ctx)
    local script = [[dir=$(zoxide query -l | fzf --prompt='project> ' --height=100% --reverse) && rex do project_open dir="$dir"]]
    local here, derr = rex.session.describe_block{ block_id = ctx.block_id }
    if derr ~= nil then error(derr, 0) end
    local _, err = rex.session.new_layer{
      window_id = here.block.window_id,
      bounds = { 0.2, 0.15, 0.6, 0.6 },
      focus  = true,
      layout = rex.layout.block{ flavor = SHELL_FLAVOR, options = { command = { "sh", "-c", script } } },
    }
    if err ~= nil then error(err, 0) end
  end,
}
rex.bind("ctrl+a>g", "project_pick")

-- Sessions
rex.bind("ctrl+a>o", "session.switch")
rex.bind("ctrl+a>s", "session.switch")
rex.bind("ctrl+a>shift+4", "session.rename") -- $
rex.bind("ctrl+a>shift+x", "session.close")
rex.bind("ctrl+a>shift+9", "session.previous")
rex.bind("ctrl+a>shift+0", "session.next")

-- Resize mode: prefix r, then hjkl; Escape leaves.
rex.mode("resize", { exclusive = true })
rex.bind("ctrl+a>r", "client.mode.enter", { name = "resize" })
rex.bind("resize/h", "pane.resize", { direction = "left" })
rex.bind("resize/j", "pane.resize", { direction = "down" })
rex.bind("resize/k", "pane.resize", { direction = "up" })
rex.bind("resize/l", "pane.resize", { direction = "right" })

-- Find, prompts
rex.bind("ctrl+a>/", "client.find.open")
rex.bind("ctrl+a>[", "client.prompt.previous")
rex.bind("ctrl+a>]", "client.prompt.next")

-- Config
rex.bind("ctrl+a>shift+r", "client.config.reload")
