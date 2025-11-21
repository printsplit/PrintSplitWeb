import React, { useState, useEffect } from 'react';

interface Dimensions {
  x: number;
  y: number;
  z: number;
}

interface AlignmentHoles {
  enabled: boolean;
  diameter: number;
  depth: number;
  spacing: 'sparse' | 'normal' | 'dense';
}

interface DimensionControlsProps {
  dimensions: Dimensions;
  onChange: (dimensions: Dimensions) => void;
  onBlur?: () => void;
  smartBoundaries: boolean;
  onSmartBoundariesChange: (enabled: boolean) => void;
  balancedCutting: boolean;
  onBalancedCuttingChange: (enabled: boolean) => void;
  alignmentHoles: AlignmentHoles;
  onAlignmentHolesChange: (settings: AlignmentHoles) => void;
}

const DimensionControls: React.FC<DimensionControlsProps> = ({
  dimensions,
  onChange,
  onBlur,
  smartBoundaries,
  onSmartBoundariesChange,
  balancedCutting,
  onBalancedCuttingChange,
  alignmentHoles,
  onAlignmentHolesChange
}) => {
  // Track input values as strings to allow empty state
  const [inputValues, setInputValues] = useState({
    x: dimensions.x.toString(),
    y: dimensions.y.toString(),
    z: dimensions.z.toString()
  });

  // Update input values when dimensions prop changes externally
  useEffect(() => {
    setInputValues({
      x: dimensions.x.toString(),
      y: dimensions.y.toString(),
      z: dimensions.z.toString()
    });
  }, [dimensions.x, dimensions.y, dimensions.z]);

  const isValidDimension = (value: string): boolean => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 10 && num <= 1000;
  };

  const handleInputChange = (axis: keyof Dimensions, value: string) => {
    // Update input state (allows empty/invalid values)
    setInputValues(prev => ({ ...prev, [axis]: value }));

    // Only propagate valid changes to parent
    if (isValidDimension(value)) {
      const numValue = parseFloat(value);
      onChange({
        ...dimensions,
        [axis]: numValue
      });
    }
  };

  const handleInputBlur = (axis: keyof Dimensions) => {
    // On blur, if value is invalid, restore the last valid value
    if (!isValidDimension(inputValues[axis])) {
      setInputValues(prev => ({ ...prev, [axis]: dimensions[axis].toString() }));
    }
    if (onBlur) {
      onBlur();
    }
  };

  return (
    <div className="panel-section">
      <h3>3D Printer Bed Size</h3>
      <div className="dimension-controls">
        <div className="dimension-input">
          <label>X:</label>
          <input
            type="number"
            value={inputValues.x}
            onChange={(e) => handleInputChange('x', e.target.value)}
            onBlur={() => handleInputBlur('x')}
            min="10"
            max="1000"
            style={{
              outline: !isValidDimension(inputValues.x) ? '2px solid #e53e3e' : undefined
            }}
          />
          <span>mm</span>
        </div>

        <div className="dimension-input">
          <label>Y:</label>
          <input
            type="number"
            value={inputValues.y}
            onChange={(e) => handleInputChange('y', e.target.value)}
            onBlur={() => handleInputBlur('y')}
            min="10"
            max="1000"
            style={{
              outline: !isValidDimension(inputValues.y) ? '2px solid #e53e3e' : undefined
            }}
          />
          <span>mm</span>
        </div>

        <div className="dimension-input">
          <label>Z:</label>
          <input
            type="number"
            value={inputValues.z}
            onChange={(e) => handleInputChange('z', e.target.value)}
            onBlur={() => handleInputBlur('z')}
            min="10"
            max="1000"
            style={{
              outline: !isValidDimension(inputValues.z) ? '2px solid #e53e3e' : undefined
            }}
          />
          <span>mm</span>
        </div>
      </div>
      
      <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#999' }}>
        Enter the size of each cube section (model will be split into cubes of this size)
      </div>
      
      <div style={{ marginTop: '16px', borderTop: '1px solid #333', paddingTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={smartBoundaries}
            onChange={(e) => onSmartBoundariesChange(e.target.checked)}
            style={{ marginRight: '8px' }}
          />
          Smart boundaries (prevent floating parts)
        </label>
        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#999', marginLeft: '20px' }}>
          Adjusts cube boundaries to keep connected parts together
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={balancedCutting}
            onChange={(e) => onBalancedCuttingChange(e.target.checked)}
            style={{ marginRight: '8px' }}
          />
          Balanced cutting (avoid tiny pieces)
        </label>
        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#999', marginLeft: '20px' }}>
          Distributes pieces evenly when remainder is less than 50% of max dimension
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={alignmentHoles.enabled}
            onChange={(e) => onAlignmentHolesChange({ ...alignmentHoles, enabled: e.target.checked })}
            style={{ marginRight: '8px' }}
          />
          Alignment holes (for filament pins)
        </label>
        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#999', marginLeft: '20px' }}>
          Creates holes at cut centers for filament-based alignment
        </div>

        {alignmentHoles.enabled && (
          <div style={{ marginLeft: '20px', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', minWidth: '80px' }}>Diameter:</label>
              <input
                type="number"
                value={alignmentHoles.diameter}
                onChange={(e) => onAlignmentHolesChange({ ...alignmentHoles, diameter: parseFloat(e.target.value) || 1.8 })}
                min="1"
                max="5"
                step="0.1"
                style={{ width: '70px', padding: '4px' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#999' }}>mm</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '0.85rem', minWidth: '80px' }}>Depth (each):</label>
              <input
                type="number"
                value={alignmentHoles.depth}
                onChange={(e) => onAlignmentHolesChange({ ...alignmentHoles, depth: parseFloat(e.target.value) || 3 })}
                min="1"
                max="10"
                step="0.5"
                style={{ width: '70px', padding: '4px' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#999' }}>mm</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
              <label style={{ fontSize: '0.85rem', minWidth: '80px' }}>Hole pattern:</label>
              <select
                value={alignmentHoles.spacing}
                onChange={(e) => onAlignmentHolesChange({ ...alignmentHoles, spacing: e.target.value as 'sparse' | 'normal' | 'dense' })}
                style={{ width: '120px', padding: '4px' }}
              >
                <option value="sparse">Sparse (5)</option>
                <option value="normal">Normal (9)</option>
                <option value="dense">Dense (13)</option>
              </select>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#666', marginLeft: '92px', marginTop: '4px' }}>
              {alignmentHoles.spacing === 'sparse' && 'Corners + center only'}
              {alignmentHoles.spacing === 'normal' && 'Corners + center + edge midpoints'}
              {alignmentHoles.spacing === 'dense' && 'Corners + center + edges + 1/3 points'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DimensionControls;