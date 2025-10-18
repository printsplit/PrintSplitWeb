import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader, OrbitControls } from 'three-stdlib';

interface ProcessingResult {
  success: boolean;
  parts?: Array<{
    name: string;
    url: string;
    section: [number, number, number];
  }>;
  total_parts?: number;
  sections?: {
    x: number;
    y: number;
    z: number;
  };
  error?: string;
}

interface STLPreviewProps {
  file: File | null;
  dimensions: { x: number; y: number; z: number };
  processingResult?: ProcessingResult | null;
}

const STLPreview: React.FC<STLPreviewProps> = ({ file, dimensions, processingResult }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [viewMode, setViewMode] = useState<'original' | 'parts' | 'both'>('original');
  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);

  useEffect(() => {
    console.log('Scene initialization effect triggered');
    console.log('Mount ref:', mountRef.current);
    
    // Use setTimeout to ensure DOM is ready
    const initScene = () => {
      if (!mountRef.current) {
        console.log('No mount ref in timeout, returning');
        return;
      }

      console.log('Initializing Three.js scene...');

      // Initialize Three.js scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(
        75,
        mountRef.current.clientWidth / mountRef.current.clientHeight,
        0.1,
        1000
      );
      camera.position.set(0, 0, 5);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 1, 1);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      // Add renderer to DOM
      mountRef.current.appendChild(renderer.domElement);

      // Add orbit controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enableZoom = true;
      controls.enableRotate = true;
      controls.enablePan = true;
      controlsRef.current = controls;

      // Animation loop
      const animate = () => {
        animationRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Mark scene as ready
      console.log('Scene initialization complete, setting ready to true');
      setSceneReady(true);
    };

    // Start initialization after a brief delay
    const timeoutId = setTimeout(initScene, 100);

    // Handle window resize (define outside initScene so it can be removed)
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      setSceneReady(false);
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (mountRef.current && rendererRef.current?.domElement) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    console.log('STLPreview effect triggered:', { file: file?.name, dimensions, viewMode, processingResult, sceneReady });
    if (!sceneReady || !sceneRef.current) {
      console.log('Scene not ready, returning');
      return;
    }

    const loadContent = async () => {
      setLoading(true);
      setError(null);

      try {
        // Clear previous models and visualizations
        const objectsToRemove = sceneRef.current!.children.filter(
          child => child.userData.isModel || child.userData.isCutLine || child.userData.isCubeOutline
        );
        objectsToRemove.forEach(obj => sceneRef.current!.remove(obj));

        if (viewMode === 'original' && file) {
          await loadOriginalSTL(file);
        } else if (viewMode === 'parts' && processingResult?.parts) {
          await loadSplitParts(processingResult.parts);
        } else if (viewMode === 'both' && file && processingResult?.parts) {
          await loadBothViews(file, processingResult.parts);
        }

        console.log('Content loaded successfully');
        setLoading(false);
      } catch (error) {
        console.error('Error loading content:', error);
        setError('Failed to load content');
        setLoading(false);
      }
    };

    loadContent();
  }, [file, dimensions, viewMode, processingResult, sceneReady]);

  const loadSTLFile = async (source: File | string): Promise<{ geometry: THREE.BufferGeometry; originalSize: THREE.Vector3 }> => {
    console.log('Reading STL file:', source instanceof File ? source.name : source);

    let buffer: ArrayBuffer;
    if (source instanceof File) {
      // Read File object using FileReader
      buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(source);
      });
    } else {
      // Fetch URL
      buffer = await window.electronAPI.readFile(source);
    }

    // Create STL loader
    const loader = new STLLoader();

    // Load the STL geometry
    const geometry = loader.parse(buffer);
    console.log('Geometry loaded:', geometry);

    // Calculate geometry bounds for proper scaling
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const originalSize = new THREE.Vector3();
    bbox.getSize(originalSize);

    // Center the geometry
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    // Scale to fit in view (max 4 units)
    const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);
    if (maxDimension > 4) {
      const scale = 4 / maxDimension;
      geometry.scale(scale, scale, scale);
    }

    return { geometry, originalSize };
  };

  const loadOriginalSTL = async (fileOrPath: File | string) => {
    if (!file && !(typeof fileOrPath === 'string')) return;

    const { geometry, originalSize } = await loadSTLFile(fileOrPath);

    // Create material
    const material = new THREE.MeshLambertMaterial({
      color: 0x4CAF50,
      transparent: true,
      opacity: 0.8
    });

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isModel = true;
    mesh.userData.isOriginal = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    sceneRef.current!.add(mesh);

    // Add wireframe overlay
    const wireframe = new THREE.WireframeGeometry(geometry);
    const line = new THREE.LineSegments(
      wireframe,
      new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.2 })
    );
    line.userData.isModel = true;
    line.userData.isOriginal = true;
    sceneRef.current!.add(line);

    // Add split grid visualization based on dimensions
    addSplitGridVisualization(originalSize, mesh);
  };

  const loadSplitParts = async (parts: Array<{ name: string; url: string; section: [number, number, number] }>) => {
    const colors = [
      0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xffeaa7,
      0xdda0dd, 0xf39c12, 0xe74c3c, 0x3498db, 0x2ecc71,
      0x9b59b6, 0xf1c40f, 0xe67e22, 0x34495e, 0x16a085
    ];

    const partSpacing = 6; // Space between parts
    const gridCols = Math.ceil(Math.sqrt(parts.length));

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      try {
        const { geometry } = await loadSTLFile(part.url);

        // Create material with unique color
        const material = new THREE.MeshLambertMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 0.9
        });

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.isModel = true;
        mesh.userData.isPart = true;
        mesh.userData.partIndex = i;
        mesh.userData.partName = part.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position parts in a grid layout
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;
        mesh.position.set(
          (col - (gridCols - 1) / 2) * partSpacing,
          -(row * partSpacing),
          0
        );

        sceneRef.current!.add(mesh);

        // Add wireframe overlay
        const wireframe = new THREE.WireframeGeometry(geometry);
        const line = new THREE.LineSegments(
          wireframe,
          new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.1 })
        );
        line.userData.isModel = true;
        line.userData.isPart = true;
        line.position.copy(mesh.position);
        sceneRef.current!.add(line);
      } catch (error) {
        console.error(`Error loading part ${part.name}:`, error);
      }
    }
  };

  const loadBothViews = async (originalFileOrPath: File | string, parts: Array<{ name: string; url: string; section: [number, number, number] }>) => {
    // Load original on the left side
    const { geometry: originalGeometry, originalSize } = await loadSTLFile(originalFileOrPath);

    const originalMaterial = new THREE.MeshLambertMaterial({
      color: 0x4CAF50,
      transparent: true,
      opacity: 0.6
    });

    const originalMesh = new THREE.Mesh(originalGeometry, originalMaterial);
    originalMesh.userData.isModel = true;
    originalMesh.userData.isOriginal = true;
    originalMesh.position.x = -8; // Position on left
    originalMesh.castShadow = true;
    originalMesh.receiveShadow = true;
    sceneRef.current!.add(originalMesh);

    // Add grid visualization to original
    addSplitGridVisualization(originalSize, originalMesh);

    // Load parts on the right side
    const colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xffeaa7];
    const partSpacing = 3;
    const gridCols = Math.ceil(Math.sqrt(parts.length));

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      try {
        const { geometry } = await loadSTLFile(part.url);

        const material = new THREE.MeshLambertMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 0.9
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.isModel = true;
        mesh.userData.isPart = true;
        mesh.userData.partIndex = i;
        mesh.userData.partName = part.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position parts in a grid on the right side
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;
        mesh.position.set(
          8 + (col - (gridCols - 1) / 2) * partSpacing, // Right side
          -(row * partSpacing),
          0
        );

        sceneRef.current!.add(mesh);
      } catch (error) {
        console.error(`Error loading part ${part.name}:`, error);
      }
    }
  };

  const addSplitGridVisualization = (modelSize: THREE.Vector3, mesh: THREE.Mesh) => {
    if (!sceneRef.current) return;
    
    // Get mesh bounding box in world coordinates
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const min = box.min;
    const max = box.max;

    console.log('Model bounding box:', {
      min: { x: min.x, y: min.y, z: min.z },
      max: { x: max.x, y: max.y, z: max.z },
      size: { x: size.x, y: size.y, z: size.z }
    });

    // Convert cube dimensions from mm to model units (approximate scale factor)
    // Since we scale the model to fit in 4 units max, we need to calculate the scale factor
    const maxModelDimension = Math.max(size.x, size.y, size.z);
    const scaleFactorApprox = maxModelDimension / Math.max(modelSize.x, modelSize.y, modelSize.z);
    
    const cubeX = (dimensions.x * scaleFactorApprox);
    const cubeY = (dimensions.y * scaleFactorApprox);
    const cubeZ = (dimensions.z * scaleFactorApprox);

    console.log('Cube dimensions in model units:', { cubeX, cubeY, cubeZ });
    console.log('Scale factor:', scaleFactorApprox);

    // Calculate how many sections are needed based on actual cube sizes
    const sections = {
      x: Math.max(1, Math.ceil(size.x / cubeX)),
      y: Math.max(1, Math.ceil(size.y / cubeY)),
      z: Math.max(1, Math.ceil(size.z / cubeZ))
    };

    console.log('Grid sections:', sections);

    // Only show grid if splitting is needed
    if (sections.x === 1 && sections.y === 1 && sections.z === 1) return;

    // Create different materials for different axes
    const xAxisMaterial = new THREE.LineBasicMaterial({ 
      color: 0xff4444,  // Red for X cuts
      opacity: 0.8,
      transparent: true,
      linewidth: 2
    });

    const yAxisMaterial = new THREE.LineBasicMaterial({ 
      color: 0x44ff44,  // Green for Y cuts
      opacity: 0.8,
      transparent: true,
      linewidth: 2
    });

    const zAxisMaterial = new THREE.LineBasicMaterial({ 
      color: 0x4444ff,  // Blue for Z cuts
      opacity: 0.8,
      transparent: true,
      linewidth: 2
    });

    // X-axis cuts (YZ planes)
    for (let i = 1; i < sections.x; i++) {
      const x = min.x + (i * cubeX);
      
      // Create a plane that spans the full model height and depth
      const points = [
        // Front face of cutting plane
        new THREE.Vector3(x, min.y, min.z),
        new THREE.Vector3(x, max.y, min.z),
        new THREE.Vector3(x, max.y, max.z),
        new THREE.Vector3(x, min.y, max.z),
        new THREE.Vector3(x, min.y, min.z), // Close the loop
      ];
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, xAxisMaterial);
      line.userData.isModel = true;
      line.userData.isCutLine = true;
      sceneRef.current.add(line);
    }

    // Y-axis cuts (XZ planes)
    for (let i = 1; i < sections.y; i++) {
      const y = min.y + (i * cubeY);
      
      const points = [
        // Horizontal cutting plane
        new THREE.Vector3(min.x, y, min.z),
        new THREE.Vector3(max.x, y, min.z),
        new THREE.Vector3(max.x, y, max.z),
        new THREE.Vector3(min.x, y, max.z),
        new THREE.Vector3(min.x, y, min.z), // Close the loop
      ];
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, yAxisMaterial);
      line.userData.isModel = true;
      line.userData.isCutLine = true;
      sceneRef.current.add(line);
    }

    // Z-axis cuts (XY planes)
    for (let i = 1; i < sections.z; i++) {
      const z = min.z + (i * cubeZ);
      
      const points = [
        // Horizontal cutting plane at Z level
        new THREE.Vector3(min.x, min.y, z),
        new THREE.Vector3(max.x, min.y, z),
        new THREE.Vector3(max.x, max.y, z),
        new THREE.Vector3(min.x, max.y, z),
        new THREE.Vector3(min.x, min.y, z), // Close the loop
      ];
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, zAxisMaterial);
      line.userData.isModel = true;
      line.userData.isCutLine = true;
      sceneRef.current.add(line);
    }

    // Add cube boundary visualization
    if (sections.x > 1 || sections.y > 1 || sections.z > 1) {
      const cubeOutlineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xffffff,
        opacity: 0.3,
        transparent: true
      });

      // Draw cube boundaries to show the grid
      for (let x = 0; x < sections.x; x++) {
        for (let y = 0; y < sections.y; y++) {
          for (let z = 0; z < sections.z; z++) {
            const cubeMin = new THREE.Vector3(
              min.x + x * cubeX,
              min.y + y * cubeY,
              min.z + z * cubeZ
            );
            
            const cubeMax = new THREE.Vector3(
              Math.min(min.x + (x + 1) * cubeX, max.x),
              Math.min(min.y + (y + 1) * cubeY, max.y),
              Math.min(min.z + (z + 1) * cubeZ, max.z)
            );

            // Create wireframe cube outline
            const cubeGeometry = new THREE.BoxGeometry(
              cubeMax.x - cubeMin.x,
              cubeMax.y - cubeMin.y,
              cubeMax.z - cubeMin.z
            );
            
            const cubeWireframe = new THREE.WireframeGeometry(cubeGeometry);
            const cubeLine = new THREE.LineSegments(cubeWireframe, cubeOutlineMaterial);
            
            cubeLine.position.set(
              (cubeMin.x + cubeMax.x) / 2,
              (cubeMin.y + cubeMax.y) / 2,
              (cubeMin.z + cubeMax.z) / 2
            );
            
            cubeLine.userData.isModel = true;
            cubeLine.userData.isCubeOutline = true;
            sceneRef.current.add(cubeLine);
          }
        }
      }
    }
  };

  return (
    <div className="preview-container">
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div
          ref={mountRef}
          style={{ width: '100%', height: '100%' }}
        />

        {/* View Mode Controls */}
        {(file || processingResult?.parts) && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            background: 'rgba(0,0,0,0.7)',
            padding: '8px',
            borderRadius: '6px',
            display: 'flex',
            gap: '8px',
            fontSize: '0.8rem'
          }}>
            <button
              onClick={() => setViewMode('original')}
              disabled={!file}
              style={{
                background: viewMode === 'original' ? '#5a8bc4' : 'transparent',
                color: '#fff',
                border: '1px solid #666',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: file ? 'pointer' : 'not-allowed',
                opacity: !file ? 0.5 : 1
              }}
            >
              Original
            </button>
            <button
              onClick={() => setViewMode('parts')}
              disabled={!processingResult?.parts}
              style={{
                background: viewMode === 'parts' ? '#5a8bc4' : 'transparent',
                color: '#fff',
                border: '1px solid #666',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: processingResult?.parts ? 'pointer' : 'not-allowed',
                opacity: !processingResult?.parts ? 0.5 : 1
              }}
            >
              Parts ({processingResult?.parts?.length || 0})
            </button>
            <button
              onClick={() => setViewMode('both')}
              disabled={!file || !processingResult?.parts}
              style={{
                background: viewMode === 'both' ? '#5a8bc4' : 'transparent',
                color: '#fff',
                border: '1px solid #666',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: (file && processingResult?.parts) ? 'pointer' : 'not-allowed',
                opacity: (!file || !processingResult?.parts) ? 0.5 : 1
              }}
            >
              Both
            </button>
          </div>
        )}

        {/* Parts List */}
        {viewMode === 'parts' && processingResult?.parts && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.7)',
            padding: '8px',
            borderRadius: '6px',
            maxWidth: '200px',
            maxHeight: '300px',
            overflowY: 'auto',
            fontSize: '0.75rem',
            color: '#fff'
          }}>
            <div style={{ marginBottom: '6px', fontWeight: 'bold' }}>
              Parts ({processingResult.parts.length}):
            </div>
            {processingResult.parts.map((part, index) => (
              <div
                key={index}
                style={{
                  padding: '2px 4px',
                  margin: '2px 0',
                  background: selectedPartIndex === index ? '#5a8bc4' : 'transparent',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                onClick={() => setSelectedPartIndex(selectedPartIndex === index ? null : index)}
              >
                {part.name}
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.8)',
            padding: '12px 20px',
            borderRadius: '6px',
            color: '#fff'
          }}>
            Loading...
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            top: '60px',
            left: '10px',
            background: 'rgba(244,67,54,0.9)',
            padding: '8px 12px',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        {!file && !loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>
              No STL file selected
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              Select an STL file to preview
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default STLPreview;