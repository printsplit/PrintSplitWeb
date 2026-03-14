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

interface SplitPositions {
  x: number[];
  y: number[];
  z: number[];
}

interface STLPreviewProps {
  file: File | null;
  dimensions: { x: number; y: number; z: number };
  processingResult?: ProcessingResult | null;
  splitPositions?: SplitPositions | null;
  onSplitPositionsChange?: (positions: SplitPositions) => void;
}

interface DragState {
  isDragging: boolean;
  plane: THREE.Mesh | null;
  axis: 'x' | 'y' | 'z';
  index: number;
  startPos: number;
  dragPlane: THREE.Plane;
  offset: number;
}

interface ModelInfo {
  scaleFactor: number;
  sceneBounds: { min: THREE.Vector3; max: THREE.Vector3 };
  originalSize: THREE.Vector3;
}

const STLPreview: React.FC<STLPreviewProps> = ({ file, dimensions, processingResult, splitPositions, onSplitPositionsChange }) => {
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

  // Drag state refs
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    plane: null,
    axis: 'x',
    index: 0,
    startPos: 0,
    dragPlane: new THREE.Plane(),
    offset: 0,
  });
  const modelInfoRef = useRef<ModelInfo | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Stable ref for callback to avoid effect re-runs on every render
  const onSplitPositionsChangeRef = useRef(onSplitPositionsChange);
  onSplitPositionsChangeRef.current = onSplitPositionsChange;

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

  // Pointer event handlers for dragging cut planes
  useEffect(() => {
    if (!sceneReady || !rendererRef.current) return;
    const canvas = rendererRef.current.domElement;

    const MIN_GAP_MM = 5; // Minimum gap between planes in mm

    const getCutPlaneMeshes = (): THREE.Mesh[] => {
      if (!sceneRef.current) return [];
      return sceneRef.current.children.filter(
        (c): c is THREE.Mesh => c.userData.isCutPlane === true
      );
    };

    const sceneToMm = (scenePos: number, axis: 'x' | 'y' | 'z'): number => {
      const info = modelInfoRef.current;
      if (!info) return 0;
      const axisIdx = axis === 'x' ? 'x' : axis === 'y' ? 'y' : 'z';
      const sceneBoundsMin = info.sceneBounds.min[axisIdx];
      return (scenePos - sceneBoundsMin) / info.scaleFactor;
    };


    const collectPositions = (): SplitPositions => {
      const positions: SplitPositions = { x: [], y: [], z: [] };
      for (const mesh of getCutPlaneMeshes()) {
        const axis = mesh.userData.axis as 'x' | 'y' | 'z';
        const posComponent = axis === 'x' ? mesh.position.x : axis === 'y' ? mesh.position.y : mesh.position.z;
        positions[axis].push(sceneToMm(posComponent, axis));
      }
      positions.x.sort((a, b) => a - b);
      positions.y.sort((a, b) => a - b);
      positions.z.sort((a, b) => a - b);
      return positions;
    };

    const updateMouseFromEvent = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!cameraRef.current || !sceneRef.current || !onSplitPositionsChangeRef.current) return;

      updateMouseFromEvent(e);
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const cutPlanes = getCutPlaneMeshes();
      const intersects = raycasterRef.current.intersectObjects(cutPlanes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const axis = hit.userData.axis as 'x' | 'y' | 'z';
        const index = hit.userData.index as number;

        // Build a drag plane perpendicular to the camera but constraining movement along the cut axis
        const cameraDir = new THREE.Vector3();
        cameraRef.current.getWorldDirection(cameraDir);

        // Use a plane that contains the hit point and is perpendicular to the camera
        const dragPlane = new THREE.Plane();
        dragPlane.setFromNormalAndCoplanarPoint(cameraDir, intersects[0].point);

        const currentPos = axis === 'x' ? hit.position.x : axis === 'y' ? hit.position.y : hit.position.z;

        dragStateRef.current = {
          isDragging: true,
          plane: hit,
          axis,
          index,
          startPos: currentPos,
          dragPlane,
          offset: currentPos - (axis === 'x' ? intersects[0].point.x : axis === 'y' ? intersects[0].point.y : intersects[0].point.z),
        };

        // Disable orbit controls while dragging
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }

        // Highlight the dragged plane
        const mat = hit.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.5;

        canvas.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!cameraRef.current) return;
      updateMouseFromEvent(e);

      const ds = dragStateRef.current;

      if (ds.isDragging && ds.plane && modelInfoRef.current) {
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

        const intersectPoint = new THREE.Vector3();
        if (raycasterRef.current.ray.intersectPlane(ds.dragPlane, intersectPoint)) {
          const rawPos = (ds.axis === 'x' ? intersectPoint.x : ds.axis === 'y' ? intersectPoint.y : intersectPoint.z) + ds.offset;

          const info = modelInfoRef.current;
          const boundsMin = ds.axis === 'x' ? info.sceneBounds.min.x : ds.axis === 'y' ? info.sceneBounds.min.y : info.sceneBounds.min.z;
          const boundsMax = ds.axis === 'x' ? info.sceneBounds.max.x : ds.axis === 'y' ? info.sceneBounds.max.y : info.sceneBounds.max.z;

          const minGapScene = MIN_GAP_MM * info.scaleFactor;

          // Clamp within model bounds with minimum gap from edges
          let clampedPos = Math.max(boundsMin + minGapScene, Math.min(boundsMax - minGapScene, rawPos));

          // Enforce minimum gap between adjacent planes
          const samAxisPlanes = getCutPlaneMeshes()
            .filter(m => m.userData.axis === ds.axis && m !== ds.plane)
            .map(m => ds.axis === 'x' ? m.position.x : ds.axis === 'y' ? m.position.y : m.position.z)
            .sort((a, b) => a - b);

          for (const otherPos of samAxisPlanes) {
            if (Math.abs(clampedPos - otherPos) < minGapScene) {
              clampedPos = clampedPos < otherPos ? otherPos - minGapScene : otherPos + minGapScene;
            }
          }

          // Update plane position
          if (ds.axis === 'x') ds.plane.position.x = clampedPos;
          else if (ds.axis === 'y') ds.plane.position.y = clampedPos;
          else ds.plane.position.z = clampedPos;

          // Rebuild cube outlines during drag
          rebuildCubeOutlines();
        }
      } else {
        // Hover feedback
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const cutPlanes = getCutPlaneMeshes();
        const intersects = raycasterRef.current.intersectObjects(cutPlanes);
        canvas.style.cursor = intersects.length > 0 && onSplitPositionsChangeRef.current ? 'grab' : '';

        // Reset opacity for non-hovered planes
        for (const mesh of cutPlanes) {
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = intersects.length > 0 && intersects[0].object === mesh ? 0.35 : 0.2;
        }
      }
    };

    const rebuildCubeOutlines = () => {
      if (!sceneRef.current || !modelInfoRef.current) return;
      // Remove existing cube outlines
      const toRemove = sceneRef.current.children.filter(c => c.userData.isCubeOutline);
      toRemove.forEach(obj => sceneRef.current!.remove(obj));

      const info = modelInfoRef.current;
      const min = info.sceneBounds.min;
      const max = info.sceneBounds.max;

      // Get plane positions per axis
      const getAxisPositions = (axis: 'x' | 'y' | 'z'): number[] => {
        const positions = getCutPlaneMeshes()
          .filter(m => m.userData.axis === axis)
          .map(m => axis === 'x' ? m.position.x : axis === 'y' ? m.position.y : m.position.z)
          .sort((a, b) => a - b);
        const axisMin = axis === 'x' ? min.x : axis === 'y' ? min.y : min.z;
        const axisMax = axis === 'x' ? max.x : axis === 'y' ? max.y : max.z;
        return [axisMin, ...positions, axisMax];
      };

      const xBounds = getAxisPositions('x');
      const yBounds = getAxisPositions('y');
      const zBounds = getAxisPositions('z');

      const cubeOutlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.3,
        transparent: true
      });

      for (let xi = 0; xi < xBounds.length - 1; xi++) {
        for (let yi = 0; yi < yBounds.length - 1; yi++) {
          for (let zi = 0; zi < zBounds.length - 1; zi++) {
            const sx = xBounds[xi + 1] - xBounds[xi];
            const sy = yBounds[yi + 1] - yBounds[yi];
            const sz = zBounds[zi + 1] - zBounds[zi];
            const cubeGeometry = new THREE.BoxGeometry(sx, sy, sz);
            const cubeWireframe = new THREE.WireframeGeometry(cubeGeometry);
            const cubeLine = new THREE.LineSegments(cubeWireframe, cubeOutlineMaterial);
            cubeLine.position.set(
              (xBounds[xi] + xBounds[xi + 1]) / 2,
              (yBounds[yi] + yBounds[yi + 1]) / 2,
              (zBounds[zi] + zBounds[zi + 1]) / 2
            );
            cubeLine.userData.isModel = true;
            cubeLine.userData.isCubeOutline = true;
            sceneRef.current!.add(cubeLine);
          }
        }
      }
    };

    const onPointerUp = () => {
      const ds = dragStateRef.current;
      if (ds.isDragging && ds.plane) {
        // Reset opacity
        const mat = ds.plane.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.2;

        // Re-enable orbit controls
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }

        // Collect all positions and notify parent
        if (onSplitPositionsChangeRef.current) {
          const positions = collectPositions();
          onSplitPositionsChangeRef.current(positions);
        }

        ds.isDragging = false;
        ds.plane = null;
        canvas.style.cursor = '';
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [sceneReady]);

  useEffect(() => {
    console.log('STLPreview effect triggered:', { file: file?.name, dimensions, viewMode, processingResult, sceneReady });
    if (!sceneReady || !sceneRef.current) {
      console.log('Scene not ready, returning');
      return;
    }

    // Cancellation flag to prevent stale async loads from overwriting the scene
    let cancelled = false;

    const loadContent = async () => {
      setLoading(true);
      setError(null);

      try {
        // Clear previous models and visualizations
        const objectsToRemove = sceneRef.current!.children.filter(
          child => child.userData.isModel || child.userData.isCutLine || child.userData.isCubeOutline || child.userData.isCutPlane
        );
        objectsToRemove.forEach(obj => sceneRef.current!.remove(obj));

        if (cancelled) return;

        if (viewMode === 'original' && file) {
          await loadOriginalSTL(file);
        } else if (viewMode === 'parts' && processingResult?.parts) {
          await loadSplitParts(processingResult.parts);
        } else if (viewMode === 'both' && file && processingResult?.parts) {
          await loadBothViews(file, processingResult.parts);
        }

        if (cancelled) return;

        console.log('Content loaded successfully');
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading content:', error);
        setError('Failed to load content');
        setLoading(false);
      }
    };

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [file, dimensions, viewMode, processingResult, sceneReady, splitPositions]);

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
    const min = box.min.clone();
    const max = box.max.clone();

    // Convert cube dimensions from mm to model units (approximate scale factor)
    const maxModelDimension = Math.max(size.x, size.y, size.z);
    const scaleFactorApprox = maxModelDimension / Math.max(modelSize.x, modelSize.y, modelSize.z);

    // Store model info for drag unit conversion
    modelInfoRef.current = {
      scaleFactor: scaleFactorApprox,
      sceneBounds: { min: min.clone(), max: max.clone() },
      originalSize: modelSize.clone(),
    };

    // Determine cut plane positions (in scene units)
    let xCuts: number[] = [];
    let yCuts: number[] = [];
    let zCuts: number[] = [];

    if (splitPositions) {
      // Manual mode: convert mm positions to scene units
      xCuts = splitPositions.x.map(mm => min.x + mm * scaleFactorApprox);
      yCuts = splitPositions.y.map(mm => min.y + mm * scaleFactorApprox);
      zCuts = splitPositions.z.map(mm => min.z + mm * scaleFactorApprox);
    } else {
      // Uniform mode: compute from dimensions
      const cubeX = dimensions.x * scaleFactorApprox;
      const cubeY = dimensions.y * scaleFactorApprox;
      const cubeZ = dimensions.z * scaleFactorApprox;

      const sectionsX = Math.max(1, Math.ceil(size.x / cubeX));
      const sectionsY = Math.max(1, Math.ceil(size.y / cubeY));
      const sectionsZ = Math.max(1, Math.ceil(size.z / cubeZ));

      for (let i = 1; i < sectionsX; i++) xCuts.push(min.x + i * cubeX);
      for (let i = 1; i < sectionsY; i++) yCuts.push(min.y + i * cubeY);
      for (let i = 1; i < sectionsZ; i++) zCuts.push(min.z + i * cubeZ);
    }

    // Only show grid if splitting is needed
    if (xCuts.length === 0 && yCuts.length === 0 && zCuts.length === 0) return;

    const createCutPlaneMesh = (
      axis: 'x' | 'y' | 'z',
      position: number,
      index: number,
      color: number
    ) => {
      let planeWidth: number, planeHeight: number;
      if (axis === 'x') {
        planeWidth = size.z;
        planeHeight = size.y;
      } else if (axis === 'y') {
        planeWidth = size.x;
        planeHeight = size.z;
      } else {
        planeWidth = size.x;
        planeHeight = size.y;
      }

      const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const planeMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const planeMesh = new THREE.Mesh(planeGeo, planeMat);

      // Orient and position the plane
      if (axis === 'x') {
        planeMesh.rotation.y = Math.PI / 2;
        planeMesh.position.set(position, (min.y + max.y) / 2, (min.z + max.z) / 2);
      } else if (axis === 'y') {
        planeMesh.rotation.x = Math.PI / 2;
        planeMesh.position.set((min.x + max.x) / 2, position, (min.z + max.z) / 2);
      } else {
        planeMesh.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, position);
      }

      planeMesh.userData.isModel = true;
      planeMesh.userData.isCutPlane = true;
      planeMesh.userData.isCutLine = true; // Keep for cleanup compatibility
      planeMesh.userData.axis = axis;
      planeMesh.userData.index = index;

      sceneRef.current!.add(planeMesh);

      // Also add an outline ring around the plane for visibility
      const outlinePoints: THREE.Vector3[] = [];
      if (axis === 'x') {
        outlinePoints.push(
          new THREE.Vector3(position, min.y, min.z),
          new THREE.Vector3(position, max.y, min.z),
          new THREE.Vector3(position, max.y, max.z),
          new THREE.Vector3(position, min.y, max.z),
          new THREE.Vector3(position, min.y, min.z),
        );
      } else if (axis === 'y') {
        outlinePoints.push(
          new THREE.Vector3(min.x, position, min.z),
          new THREE.Vector3(max.x, position, min.z),
          new THREE.Vector3(max.x, position, max.z),
          new THREE.Vector3(min.x, position, max.z),
          new THREE.Vector3(min.x, position, min.z),
        );
      } else {
        outlinePoints.push(
          new THREE.Vector3(min.x, min.y, position),
          new THREE.Vector3(max.x, min.y, position),
          new THREE.Vector3(max.x, max.y, position),
          new THREE.Vector3(min.x, max.y, position),
          new THREE.Vector3(min.x, min.y, position),
        );
      }

      const lineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
      const lineMat = new THREE.LineBasicMaterial({ color, opacity: 0.8, transparent: true, linewidth: 2 });
      const outline = new THREE.Line(lineGeo, lineMat);
      outline.userData.isModel = true;
      outline.userData.isCutLine = true;
      outline.userData.parentCutPlane = planeMesh.id; // Link outline to plane for updates
      sceneRef.current!.add(outline);
    };

    // Create cut plane meshes
    xCuts.forEach((pos, i) => createCutPlaneMesh('x', pos, i, 0xff4444));
    yCuts.forEach((pos, i) => createCutPlaneMesh('y', pos, i, 0x44ff44));
    zCuts.forEach((pos, i) => createCutPlaneMesh('z', pos, i, 0x4444ff));

    // Build boundary arrays for cube outlines
    const xBounds = [min.x, ...xCuts.sort((a, b) => a - b), max.x];
    const yBounds = [min.y, ...yCuts.sort((a, b) => a - b), max.y];
    const zBounds = [min.z, ...zCuts.sort((a, b) => a - b), max.z];

    if (xBounds.length > 2 || yBounds.length > 2 || zBounds.length > 2) {
      const cubeOutlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.3,
        transparent: true
      });

      for (let xi = 0; xi < xBounds.length - 1; xi++) {
        for (let yi = 0; yi < yBounds.length - 1; yi++) {
          for (let zi = 0; zi < zBounds.length - 1; zi++) {
            const sx = xBounds[xi + 1] - xBounds[xi];
            const sy = yBounds[yi + 1] - yBounds[yi];
            const sz = zBounds[zi + 1] - zBounds[zi];

            const cubeGeometry = new THREE.BoxGeometry(sx, sy, sz);
            const cubeWireframe = new THREE.WireframeGeometry(cubeGeometry);
            const cubeLine = new THREE.LineSegments(cubeWireframe, cubeOutlineMaterial);

            cubeLine.position.set(
              (xBounds[xi] + xBounds[xi + 1]) / 2,
              (yBounds[yi] + yBounds[yi + 1]) / 2,
              (zBounds[zi] + zBounds[zi + 1]) / 2
            );

            cubeLine.userData.isModel = true;
            cubeLine.userData.isCubeOutline = true;
            sceneRef.current!.add(cubeLine);
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