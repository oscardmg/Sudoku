
(() => {
  // ---------- Utilidades ----------
  const shuffle = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
  const deepCopy9 = grid => grid.map(r => r.slice());
  const posKey = (r,c)=>`${r}-${c}`;
  const sleep = ms=> new Promise(r=>setTimeout(r,ms));

  // Clonado/serialización de notas (Map<string, Set<number>>)
  const cloneNotes = (map) => Array.from(map.entries()).map(([k,set])=>[k,[...set]]);
  const restoreNotes = (arr) => {
    const m=new Map();
    for(const [k,vals] of arr){ m.set(k, new Set(vals)); }
    return m;
  };

  // ---------- Lógica de Sudoku ----------
  function isSafe(grid, r, c, n){
    for(let i=0;i<9;i++){ if(grid[r][i]===n) return false; if(grid[i][c]===n) return false; }
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(grid[br+i][bc+j]===n) return false;
    return true;
  }

  function solveGrid(grid){
    for(let r=0;r<9;r++){
      for(let c=0;c<9;c++){
        if(grid[r][c]===0){
          for(let n=1;n<=9;n++){
            if(isSafe(grid,r,c,n)){
              grid[r][c]=n;
              if(solveGrid(grid)) return true;
              grid[r][c]=0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function countSolutions(grid, limit=2){
    let count = 0;
    function backtrack(){
      if(count>=limit) return;
      let r=-1,c=-1,min=10;
      for(let i=0;i<9;i++){
        for(let j=0;j<9;j++){
          if(grid[i][j]===0){
            const cands=[];
            for(let n=1;n<=9;n++) if(isSafe(grid,i,j,n)) cands.push(n);
            if(cands.length<min){ min=cands.length; r=i; c=j; if(min===1) break; }
          }
        }
        if(min===1) break;
      }
      if(r===-1){ count++; return; }
      for(let n=1;n<=9;n++){
        if(isSafe(grid,r,c,n)){
          grid[r][c]=n; backtrack(); grid[r][c]=0;
          if(count>=limit) return;
        }
      }
    }
    backtrack();
    return count;
  }

  function generateFullGrid(){
    const grid = Array.from({length:9},()=>Array(9).fill(0));
    for(let b=0;b<9;b+=3){
      const nums = shuffle([1,2,3,4,5,6,7,8,9]);
      let k=0;
      for(let i=0;i<3;i++) for(let j=0;j<3;j++) grid[b+i][b+j]=nums[k++];
    }
    solveGrid(grid);
    return grid;
  }

  function makePuzzle(solution, difficulty="medium"){
    const grid = deepCopy9(solution);
    const targets = { easy:[38,49], medium:[32,37], hard:[28,31] };
    const [minClues,maxClues] = targets[difficulty] || targets.medium;
    const targetClues = Math.floor((minClues+maxClues)/2);

    const order = shuffle([...Array(81).keys()]);
    let clues = 81;
    for(const idx of order){
      if(clues<=targetClues) break;
      const r = Math.floor(idx/9), c = idx%9;
      if(grid[r][c]===0) continue;
      const backup = grid[r][c];
      const r2 = 8-r, c2 = 8-c;
      const backup2 = grid[r2][c2];

      grid[r][c]=0; clues--;
      if(!(r===r2 && c===c2) && grid[r2][c2]!==0){ grid[r2][c2]=0; clues--; }

      const test = deepCopy9(grid);
      const solCount = countSolutions(test,2);
      if(solCount!==1){
        grid[r][c]=backup; clues++;
        if(!(r===r2 && c===c2) && backup2!==0){ grid[r2][c2]=backup2; clues++; }
      }
    }
    return grid;
  }

  // ---------- UI / Estado ----------
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const timerEl = document.getElementById('timer');
  const difficultyEl = document.getElementById('difficulty');
  const notesToggle = document.getElementById('notesToggle');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  let puzzle=[], solution=[], givenSet=new Set(), notes=new Map(), selected=null, notesMode=false;
  let startTime=0, timerId=null, initialPuzzle=[];
  // Tiempo acumulado (segundos) independiente del timer activo (para guardar/restaurar)
  let elapsedOffsetSec = 0;

  // Historial para deshacer/rehacer
  let history=[], future=[]; // cada item: {puzzle, notes}

  // ---------- Guardado ----------
  const STORAGE_KEY = 'sudoku_v1';

  function getElapsedNow(){
    const running = !!timerId;
    if(!running) return elapsedOffsetSec;
    return elapsedOffsetSec + Math.floor((Date.now()-startTime)/1000);
  }

  function saveState(){
    try{
      const data = {
        version: 1,
        difficulty: difficultyEl.value,
        puzzle,
        solution,
        initialPuzzle,
        given: Array.from(givenSet),
        notes: cloneNotes(notes),
        elapsed: getElapsedNow()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }catch(e){
      // Silencioso: si falla (por cuota), no interrumpimos el juego
      // console.warn('No se pudo guardar:', e);
    }
  }

  function validGrid(g){
    return Array.isArray(g) && g.length===9 && g.every(r=>Array.isArray(r) && r.length===9 && r.every(n=>Number.isInteger(n) && n>=0 && n<=9));
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const data = JSON.parse(raw);
      if(data?.version!==1) return false;
      if(!validGrid(data.puzzle) || !validGrid(data.solution) || !validGrid(data.initialPuzzle)) return false;
      puzzle = deepCopy9(data.puzzle);
      solution = deepCopy9(data.solution);
      initialPuzzle = deepCopy9(data.initialPuzzle);
      givenSet = new Set(Array.isArray(data.given)? data.given : []);
      notes = restoreNotes(Array.isArray(data.notes)? data.notes : []);
      if(typeof data.difficulty==='string'){ difficultyEl.value = data.difficulty; }
      elapsedOffsetSec = Number.isFinite(data.elapsed) ? data.elapsed : 0;

      initBoard(); render();
      // Seleccionar una celda editable si existe
      const first = boardEl.querySelector('.cell:not(.given)');
      if(first) selectCell(first);

      // Si ya está resuelto, no iniciar timer
      if(isSolved()){
        timerEl.textContent = formatTime(elapsedOffsetSec);
        setStatus('✅ Partida resuelta (cargada del guardado).', 'good');
        stopTimer(); // asegura timer parado
      }else{
        startTimer(); // reanudar tiempo
        setStatus('♻️ Partida recuperada desde el guardado automático.');
      }
      return true;
    }catch(e){
      return false;
    }
  }

  // ---------- Render / Selección ----------
  function initBoard(){
    boardEl.innerHTML='';
    for(let r=0;r<9;r++){
      for(let c=0;c<9;c++){
        const cell = document.createElement('div');
        cell.className='cell'; cell.tabIndex=0;
        cell.dataset.row = r; cell.dataset.col = c; cell.dataset.box = (Math.floor(r/3)*3+Math.floor(c/3));
        const value = document.createElement('span'); value.className='value';
        const notesBox = document.createElement('div'); notesBox.className='notes';
        for(let k=1;k<=9;k++){ const s=document.createElement('span'); s.textContent=k; s.style.visibility='hidden'; notesBox.appendChild(s); }
        cell.appendChild(value); cell.appendChild(notesBox);
        cell.addEventListener('click', ()=> selectCell(cell));
        cell.addEventListener('keydown', onCellKey);
        boardEl.appendChild(cell);
      }
    }
  }

  function render(){
    boardEl.querySelectorAll('.cell').forEach(cell=>{
      cell.classList.remove('given','selected','peer','same','conflict','wrong','hinted','has-notes');
      const r=+cell.dataset.row, c=+cell.dataset.col;
      const v = puzzle[r][c];
      const valueEl = cell.querySelector('.value');
      if(v!==0){
        valueEl.textContent = v;
      } else {
        const key = posKey(r,c);
        const nset = notes.get(key) || new Set();
        const spans = cell.querySelectorAll('.notes span');
        spans.forEach((s,i)=> s.style.visibility = nset.has(i+1) ? 'visible' : 'hidden');
        cell.classList.toggle('has-notes', nset.size>0);
        valueEl.textContent = '';
      }
      if(givenSet.has(posKey(r,c))) cell.classList.add('given');
    });
    markConflicts();
    if(selected) highlightSelection(selected);
    updateUndoRedoButtons();
  }

  function selectCell(cell){
    selected = cell;
    boardEl.querySelectorAll('.cell').forEach(c=>c.classList.remove('selected','peer','same'));
    cell.classList.add('selected');
    highlightSelection(cell);
    cell.focus();
  }

  function highlightSelection(cell){
    const r=+cell.dataset.row, c=+cell.dataset.col;
    boardEl.querySelectorAll('.cell').forEach(el=>{
      const rr=+el.dataset.row, cc=+el.dataset.col;
      if(rr===r || cc===c || el.dataset.box===cell.dataset.box) el.classList.add('peer');
    });
    const val = getCellValue(r,c);
    if(val){
      boardEl.querySelectorAll('.cell').forEach(el=>{
        const rr=+el.dataset.row, cc=+el.dataset.col;
        if(getCellValue(rr,cc)===val) el.classList.add('same');
      });
    }
  }

  const getCellValue = (r,c)=> puzzle[r][c]===0 ? null : puzzle[r][c];

  // ---------- Historial (Undo/Redo) ----------
  function saveHistory(){
    history.push({ puzzle: deepCopy9(puzzle), notes: cloneNotes(notes) });
    if(history.length>300) history.shift();
    future.length = 0;
    updateUndoRedoButtons();
    // Guardar después de cada snapshot
    saveState();
  }
  function undo(){
    if(history.length===0) return;
    future.push({ puzzle: deepCopy9(puzzle), notes: cloneNotes(notes) });
    const prev = history.pop();
    puzzle = deepCopy9(prev.puzzle);
    notes = restoreNotes(prev.notes);
    render();
    setStatus('Acción deshecha.');
    saveState();
  }
  function redo(){
    if(future.length===0) return;
    history.push({ puzzle: deepCopy9(puzzle), notes: cloneNotes(notes) });
    const next = future.pop();
    puzzle = deepCopy9(next.puzzle);
    notes = restoreNotes(next.notes);
    render();
    setStatus('Acción rehecha.');
    saveState();
  }
  function updateUndoRedoButtons(){
    if(undoBtn) undoBtn.disabled = history.length===0;
    if(redoBtn) redoBtn.disabled = future.length===0;
  }

  // ---------- Acciones de edición ----------
  function placeNumber(n){
    if(!selected) return;
    const r=+selected.dataset.row, c=+selected.dataset.col;
    const key=posKey(r,c);
    if(givenSet.has(key)) return;

    saveHistory();

    if(notesMode){
      const set = notes.get(key) || new Set();
      set.has(n) ? set.delete(n) : set.add(n);
      if(set.size===0) notes.delete(key); else notes.set(key,set);
      puzzle[r][c]=0;
    }else{
      puzzle[r][c]=n;
      notes.delete(key);
    }
    render();
    saveState();
  }

  function clearCell(){
    if(!selected) return;
    const r=+selected.dataset.row, c=+selected.dataset.col;
    const key=posKey(r,c);
    if(givenSet.has(key)) return;

    saveHistory();
    puzzle[r][c]=0; notes.delete(key);
    render();
    saveState();
  }

  function onCellKey(e){
    const code = e.key;
    if(code>='1' && code<='9'){ placeNumber(+code); e.preventDefault(); return; }
    if(code==='Backspace' || code==='Delete'){ clearCell(); e.preventDefault(); return; }
    const r=+this.dataset.row, c=+this.dataset.col;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code)){
      let rr=r, cc=c;
      if(code==='ArrowUp') rr = Math.max(0,r-1);
      if(code==='ArrowDown') rr = Math.min(8,r+1);
      if(code==='ArrowLeft') cc = Math.max(0,c-1);
      if(code==='ArrowRight') cc = Math.min(8,c+1);
      const next = boardEl.querySelector(`.cell[data-row="${rr}"][data-col="${cc}"]`);
      if(next) selectCell(next);
      e.preventDefault(); return;
    }
    if(code.toLowerCase()==='n'){ toggleNotes(); e.preventDefault(); }
  }

  function markConflicts(){
    boardEl.querySelectorAll('.cell').forEach(c=>c.classList.remove('conflict'));
    for(let r=0;r<9;r++){
      for(let c=0;c<9;c++){
        const v=puzzle[r][c]; if(!v) continue;
        for(let i=0;i<9;i++) if(i!==c && puzzle[r][i]===v) conflictMark(r,c,r,i);
        for(let i=0;i<9;i++) if(i!==r && puzzle[i][c]===v) conflictMark(r,c,i,c);
        const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
        for(let i=0;i<3;i++) for(let j=0;j<3;j++){
          const rr=br+i, cc=bc+j;
          if(rr===r && cc===c) continue;
          if(puzzle[rr][cc]===v) conflictMark(r,c,rr,cc);
        }
      }
    }
    function conflictMark(r1,c1,r2,c2){
      boardEl.querySelector(`.cell[data-row="${r1}"][data-col="${c1}"]`)?.classList.add('conflict');
      boardEl.querySelector(`.cell[data-row="${r2}"][data-col="${c2}"]`)?.classList.add('conflict');
    }
  }

  function checkProgress(showWrong=true){
    let done=true, wrong=0, conflicts=boardEl.querySelectorAll('.cell.conflict').length;
    for(let r=0;r<9;r++){
      for(let c=0;c<9;c++){
        if(puzzle[r][c]===0){ done=false; continue; }
        if(solution[r][c]!==puzzle[r][c]){
          done=false; wrong++;
          if(showWrong){
            boardEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`)?.classList.add('wrong');
          }
        } else {
          boardEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`)?.classList.remove('wrong');
        }
      }
    }
    if(done && conflicts===0 && wrong===0){
      stopTimer();
      setStatus(`🎉 ¡Completado en ${timerEl.textContent}!`, 'good');
      saveState();
    }else{
      if(showWrong){
        setStatus(`Celdas vacías: ${countZeros()} • Conflictos: ${conflicts/2} • Errores: ${wrong}`, wrong||conflicts?'warn':'');
      }
    }
  }
  const countZeros = ()=> puzzle.flat().filter(v=>v===0).length;

  function isSolved(){
    for(let r=0;r<9;r++) for(let c=0;c<9;c++){
      if(puzzle[r][c]!==solution[r][c]) return false;
    }
    return true;
  }

  function setStatus(msg, kind=''){
    statusEl.textContent=msg;
    statusEl.style.color = kind==='good' ? 'var(--good)' : (kind==='warn' ? 'var(--warn)' : 'var(--muted)');
  }

  function toggleNotes(){
    notesMode = !notesMode;
    notesToggle.setAttribute('aria-pressed', String(notesMode));
    notesToggle.textContent = notesMode ? 'Notas (ON)' : 'Notas';
    setStatus(notesMode ? 'Modo notas activo (tecla N para alternar)' : 'Modo notas desactivado');
  }

  // ---------- Generación / Juego ----------
  async function newGame(){
    setStatus('Generando tablero...');
    disableAll(true);
    await sleep(0);
    const full = generateFullGrid();
    const diff = difficultyEl.value;
    const puzz = makePuzzle(full, diff);

    solution = full;
    puzzle = deepCopy9(puzz);
    initialPuzzle = deepCopy9(puzz);
    givenSet = new Set();
    notes.clear(); selected=null; notesMode=false;
    notesToggle.setAttribute('aria-pressed','false');
    for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(puzz[r][c]!==0) givenSet.add(posKey(r,c));

    // reset historial y tiempo
    history.length = 0;
    future.length = 0;
    elapsedOffsetSec = 0;

    initBoard(); render();
    startTimer();
    setStatus(`Dificultad: ${labelDiff(diff)} • Pistas: ${81-countZeros()}`);
    disableAll(false);
    const firstEmpty = boardEl.querySelector('.cell:not(.given)');
    if(firstEmpty) selectCell(firstEmpty);

    saveState();
  }

  function labelDiff(d){ return d==='easy'?'Fácil': d==='hard'?'Difícil':'Media'; }

  function giveHint(){
    const empties = [];
    for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(puzzle[r][c]===0) empties.push([r,c]);
    if(empties.length===0){ setStatus('No hay celdas vacías para pista.'); return; }
    saveHistory();
    const [r,c] = empties[Math.floor(Math.random()*empties.length)];
    const val = solution[r][c];
    const key=posKey(r,c);
    puzzle[r][c]=val; notes.delete(key);
    const cell = boardEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    cell?.classList.add('hinted');
    render();
    setStatus('Se ha rellenado una celda correcta.');
    checkProgress(false);
    saveState();
  }

  function clearUser(){
    saveHistory();
    for(let r=0;r<9;r++) for(let c=0;c<9;c++){
      const key=posKey(r,c);
      if(!givenSet.has(key)){ puzzle[r][c]=0; notes.delete(key); }
    }
    render(); setStatus('Tablero limpiado.');
    saveState();
  }

  function restart(){
    saveHistory();
    puzzle = deepCopy9(initialPuzzle);
    notes.clear();
    render(); setStatus('Reiniciado al estado inicial.');
    saveState();
  }

  function solveAll(){
    saveHistory();
    puzzle = deepCopy9(solution);
    notes.clear(); render(); stopTimer();
    setStatus('Tablero resuelto.');
    saveState();
  }

  function disableAll(disabled){
    document.querySelectorAll('button, select').forEach(el=>{
      if(el.id==='solveBtn') return; // permitir resolver siempre
      el.disabled = disabled;
    });
    updateUndoRedoButtons();
  }

  // ---------- Timer ----------
  function formatTime(totalSec){
    const m = String(Math.floor(totalSec/60)).padStart(2,'0');
    const s = String(totalSec%60).padStart(2,'0');
    return `${m}:${s}`;
  }

  function startTimer(){
    stopTimer(); startTime = Date.now();
    timerId = setInterval(()=>{
      const sec = getElapsedNow();
      timerEl.textContent = formatTime(sec);
    }, 250);
  }
  function stopTimer(){
    if(timerId){
      elapsedOffsetSec = getElapsedNow(); // fija el acumulado actual
      clearInterval(timerId); timerId=null;
    }
  }

  // ---------- Eventos UI ----------
  document.getElementById('newGameBtn').addEventListener('click', newGame);
  document.getElementById('solveBtn').addEventListener('click', solveAll);
  document.getElementById('checkBtn').addEventListener('click', ()=>{ checkProgress(true); saveState(); });
  document.getElementById('hintBtn').addEventListener('click', giveHint);
  document.getElementById('clearBtn').addEventListener('click', clearUser);
  document.getElementById('restartBtn').addEventListener('click', restart);
  document.getElementById('eraseKey').addEventListener('click', ()=>{ clearCell(); saveState(); });
  notesToggle.addEventListener('click', toggleNotes);
  document.querySelectorAll('.key[data-key]').forEach(btn=>{
    btn.addEventListener('click', ()=> { placeNumber(+btn.dataset.key); });
  });

  // Deshacer / Rehacer (botones)
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // Atajos globales
  window.addEventListener('keydown', (e)=>{
    if(e.target.closest('input,textarea,[contenteditable="true"]')) return;

    // Notas
    if(e.key.toLowerCase()==='n'){ toggleNotes(); return; }

    // Undo/Redo
    const z = e.key.toLowerCase()==='z';
    const y = e.key.toLowerCase()==='y';
    const meta = e.ctrlKey || e.metaKey;

    if(meta && z && !e.shiftKey){ e.preventDefault(); undo(); return; }
    if((meta && z && e.shiftKey) || (meta && y)){ e.preventDefault(); redo(); return; }
  });

  // Guardar al salir por si hay cambios pendientes
  window.addEventListener('beforeunload', saveState);

  // ---------- Inicio ----------
  initBoard();
  if(!loadState()){
    newGame();
  }
})();
