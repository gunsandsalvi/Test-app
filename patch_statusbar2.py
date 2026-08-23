import sys

with open('src/App.tsx', 'r') as f:
    text = f.read()

start = text.find('{/* Top Status Bar */}')
end = text.find('{/* Segmented Navigation Tab Bar */}', start)

new_bar = """{/* Expandable Status Bar */}
        <StatusBar
          state={state}
          isExpanded={isStatusBarExpanded}
          onToggleExpanded={() => setIsStatusBarExpanded(p => !p)}
          onAdvanceWeek={handleAdvanceWeek}
          isAutoAdvancing={isAutoAdvancing}
          onToggleAutoAdvance={() => setIsAutoAdvancing(!isAutoAdvancing)}
          onOpenOverflow={() => setIsOverflowOpen(true)}
        />
        {isOverflowOpen && (
          <OverflowMenu
            state={state}
            onClose={() => setIsOverflowOpen(false)}
            onRestart={handleResetGame}
          />
        )}
        
        """

text = text[:start] + new_bar + text[end:]

with open('src/App.tsx', 'w') as f:
    f.write(text)

