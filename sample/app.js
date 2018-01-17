let image = new Image();

$(".check").change(function(){
  console.log("checkbox")
  render()
})

$(document).on('change', ':file', function(){
  if (!this.files.length) {
    alert('ファイルが選択されていません');
    return;
  }
  let file = this.files[0];
  console.log(file)
  let fr = new FileReader();

  fr.onload = function(evt) {
    console.log(evt)
    let img = new Image();
    img.onload = function() {
      console.log("img load complete")
      if(img.width > 4096 || img.height > 4096) {
        let imageCanvas = $('<canvas id="image" width=0 height=0></canvas>')
        $('body').append(imageCanvas);
        // let imageCanvas = $("#image");
        let ctx = imageCanvas[0].getContext('2d');
        let cnvsH = 4096;
        let cnvsW = img.naturalWidth*cnvsH/img.naturalHeight;
        imageCanvas.attr('width', cnvsW);
        imageCanvas.attr('height', cnvsH);
        ctx.drawImage(img, 0, 0, cnvsW, cnvsH);
        
        image.src = imageCanvas[0].toDataURL("image/png");
        imageCanvas.remove();       
      } else {
        image.src = evt.target.result;
      }
    }
    image.onload = function(){
      console.log("image load complete")
      render();
    }
    img.src = evt.target.result;
  }
  fr.readAsDataURL(file);
})


let render = function(){
  
  // canvasエレメントを取得
  c = document.getElementById('canvas');
  c.width = 512;
  c.height = c.width * image.height/image.width;
  
  
  // webglコンテキストを取得
  let gl = c.getContext('webgl') || c.getContext('experimental-webgl');
  
  // エレメントへの参照を取得
  let sobelFlag = document.getElementById('sobel');
  let grayFlag = document.getElementById('Gray');

  // シェーダの準備と各種ロケーションの取得
  let v_shader = create_shader('vs');
  let f_shader = create_shader('fs');
  let prg = create_program(v_shader, f_shader);
  let attLocation = new Array();
  attLocation[0] = gl.getAttribLocation(prg, 'position');
  attLocation[1] = gl.getAttribLocation(prg, 'normal');
  attLocation[2] = gl.getAttribLocation(prg, 'color');
  let attStride = new Array();
  attStride[0] = 3;
  attStride[1] = 3;
  attStride[2] = 4;
  let uniLocation = new Array();
  uniLocation[0] = gl.getUniformLocation(prg, 'mvpMatrix');
  uniLocation[1] = gl.getUniformLocation(prg, 'invMatrix');
  uniLocation[2] = gl.getUniformLocation(prg, 'lightDirection');
  uniLocation[3] = gl.getUniformLocation(prg, 'eyeDirection');
  uniLocation[4] = gl.getUniformLocation(prg, 'ambientColor');
  
  // 正射影で板ポリゴンをレンダリングするシェーダ
  v_shader = create_shader('ovs');
  f_shader = create_shader('ofs');
  let oPrg = create_program(v_shader, f_shader);
  let oAttLocation = new Array();
  oAttLocation[0] = gl.getAttribLocation(oPrg, 'position');
  oAttLocation[1] = gl.getAttribLocation(oPrg, 'texCoord');
  let oAttStride = new Array();
  oAttStride[0] = 3;
  oAttStride[1] = 2;
  let oUniLocation = new Array();
  oUniLocation[0] = gl.getUniformLocation(oPrg, 'mvpMatrix');
  oUniLocation[1] = gl.getUniformLocation(oPrg, 'texture');
  oUniLocation[2] = gl.getUniformLocation(oPrg, 'sobel');
  oUniLocation[3] = gl.getUniformLocation(oPrg, 'gray');
  oUniLocation[4] = gl.getUniformLocation(oPrg, 'hCoef');
  oUniLocation[5] = gl.getUniformLocation(oPrg, 'vCoef');
  oUniLocation[6] = gl.getUniformLocation(oPrg, 'textureSize');
  
  // テクスチャ
  let tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let texture = tex;
  gl.bindTexture(gl.TEXTURE_2D, null);


  
  // 板ポリゴン
  let position = [
    -1.0,  1.0,  0.0,
     1.0,  1.0,  0.0,
    -1.0, -1.0,  0.0,
     1.0, -1.0,  0.0
  ];
  let texCoord = [
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    1.0, 1.0
  ];

  let index = [
    0, 2, 1,
    2, 3, 1
  ];
  let vPosition = create_vbo(position);
  let vTexCoord = create_vbo(texCoord);
  let vVBOList  = [vPosition, vTexCoord];
  let vIndex    = create_ibo(index);
  
  // 各種行列の生成と初期化
  let m = new matIV();
  let mMatrix   = m.identity(m.create());
  let vMatrix   = m.identity(m.create());
  let pMatrix   = m.identity(m.create());
  let tmpMatrix = m.identity(m.create());
  let mvpMatrix = m.identity(m.create());
  let invMatrix = m.identity(m.create());
  
  // 深度テストとカリングを有効にする
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  
  // ライトの向き
  let lightDirection = [-0.577, 0.577, 0.577];
  
  // sobelフィルタのカーネル
  let hCoef = [
     1.0,  0.0, -1.0,
     2.0,  0.0, -2.0,
     1.0,  0.0, -1.0
  ];
  let vCoef = [
     1.0,  2.0,  1.0,
     0.0,  0.0,  0.0,
    -1.0, -2.0, -1.0
  ];
  let gaussianBlur = [
    0.045, 0.122, 0.045,
    0.122, 0.332, 0.122,
    0.045, 0.122, 0.045
  ];
  
  // フレームバッファオブジェクトの取得
  let fBufferWidth  = c.width;
  let fBufferHeight = c.height;
  let fBuffer = create_framebuffer(fBufferWidth, fBufferHeight);
  
  // カウンタの宣言
  let count = 0;
  let count2 = 0;
  
  // // 恒常ループ
  // (function(){
    // プログラムオブジェクトの選択
    gl.useProgram(prg);
    
    // フレームバッファのバインド
    gl.bindFramebuffer(gl.FRAMEBUFFER, fBuffer.f);
    
    // フレームバッファを初期化
    let hsv = hsva(count2 % 360, 1, 1, 1); 
    gl.clearColor(hsv[0], hsv[1], hsv[2], hsv[3]);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    

    // プログラムオブジェクトの選択
    gl.useProgram(oPrg);
    
    // フレームバッファのバインドを解除
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    
    // テクスチャの適用
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // エレメントから色変換するかどうかのフラグを取得
    // let sobel = ;
    // let sobelGray = ;
    
    // 板ポリゴンのレンダリング
    set_attribute(vVBOList, oAttLocation, oAttStride);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vIndex);
    gl.uniformMatrix4fv(oUniLocation[0], false, tmpMatrix);
    gl.uniform1i(oUniLocation[1], 0);
    gl.uniform1i(oUniLocation[2], sobelFlag.checked);
    gl.uniform1i(oUniLocation[3], grayFlag.checked);
    gl.uniform1fv(oUniLocation[4], hCoef);
    gl.uniform1fv(oUniLocation[5], vCoef);
    gl.uniform2f(oUniLocation[6], c.width,c.height);
    gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0);
    
    // コンテキストの再描画
    gl.flush();
    
  // シェーダを生成する関数
  function create_shader(id){
    // シェーダを格納する変数
    let shader;
    
    // HTMLからscriptタグへの参照を取得
    let scriptElement = document.getElementById(id);
    
    // scriptタグが存在しない場合は抜ける
    if(!scriptElement){return;}
    
    // scriptタグのtype属性をチェック
    switch(scriptElement.type){
      
      // 頂点シェーダの場合
      case 'x-shader/x-vertex':
        shader = gl.createShader(gl.VERTEX_SHADER);
        break;
        
      // フラグメントシェーダの場合
      case 'x-shader/x-fragment':
        shader = gl.createShader(gl.FRAGMENT_SHADER);
        break;
      default :
        return;
    }
    
    // 生成されたシェーダにソースを割り当てる
    gl.shaderSource(shader, scriptElement.text);
    
    // シェーダをコンパイルする
    gl.compileShader(shader);
    
    // シェーダが正しくコンパイルされたかチェック
    if(gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      
      // 成功していたらシェーダを返して終了
      return shader;
    }else{
      
      // 失敗していたらエラーログをアラートする
      alert(gl.getShaderInfoLog(shader));
    }
  }
  
  // プログラムオブジェクトを生成しシェーダをリンクする関数
  function create_program(vs, fs){
    // プログラムオブジェクトの生成
    let program = gl.createProgram();
    
    // プログラムオブジェクトにシェーダを割り当てる
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    
    // シェーダをリンク
    gl.linkProgram(program);
    
    // シェーダのリンクが正しく行なわれたかチェック
    if(gl.getProgramParameter(program, gl.LINK_STATUS)){
    
      // 成功していたらプログラムオブジェクトを有効にする
      gl.useProgram(program);
      
      // プログラムオブジェクトを返して終了
      return program;
    }else{
      
      // 失敗していたらエラーログをアラートする
      alert(gl.getProgramInfoLog(program));
    }
  }
  
  // VBOを生成する関数
  function create_vbo(data){
    // バッファオブジェクトの生成
    let vbo = gl.createBuffer();
    
    // バッファをバインドする
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    
    // バッファにデータをセット
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    
    // バッファのバインドを無効化
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    // 生成した VBO を返して終了
    return vbo;
  }
  
  // VBOをバインドし登録する関数
  function set_attribute(vbo, attL, attS){
    // 引数として受け取った配列を処理する
    for(let i in vbo){
      // バッファをバインドする
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo[i]);
      
      // attributeLocationを有効にする
      gl.enableVertexAttribArray(attL[i]);
      
      // attributeLocationを通知し登録する
      gl.vertexAttribPointer(attL[i], attS[i], gl.FLOAT, false, 0, 0);
    }
  }
  
  // IBOを生成する関数
  function create_ibo(data){
    // バッファオブジェクトの生成
    let ibo = gl.createBuffer();
    
    // バッファをバインドする
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    
    // バッファにデータをセット
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(data), gl.STATIC_DRAW);
    
    // バッファのバインドを無効化
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    
    // 生成したIBOを返して終了
    return ibo;
  }
  
  
  // フレームバッファをオブジェクトとして生成する関数
  function create_framebuffer(width, height){
    // フレームバッファの生成
    let frameBuffer = gl.createFramebuffer();
    
    // フレームバッファをWebGLにバインド
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    
    // 深度バッファ用レンダーバッファの生成とバインド
    let depthRenderBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
    
    // レンダーバッファを深度バッファとして設定
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    
    // フレームバッファにレンダーバッファを関連付ける
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderBuffer);
    
    // フレームバッファ用テクスチャの生成
    let fTexture = gl.createTexture();
    
    // フレームバッファ用のテクスチャをバインド
    gl.bindTexture(gl.TEXTURE_2D, fTexture);
    
    // フレームバッファ用のテクスチャにカラー用のメモリ領域を確保
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    
    // テクスチャパラメータ
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // フレームバッファにテクスチャを関連付ける
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fTexture, 0);
    
    // 各種オブジェクトのバインドを解除
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // オブジェクトを返して終了
    return {f : frameBuffer, d : depthRenderBuffer, t : fTexture};
  }
};
