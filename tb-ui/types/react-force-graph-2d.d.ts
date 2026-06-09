declare module "react-force-graph-2d" {
    import * as React from "react";
    export interface ForceGraphProps {
      graphData: { nodes: any[]; links: any[] };
      width?: number;
      height?: number;
      backgroundColor?: string;
      nodeLabel?: (node: any) => string;
      linkLabel?: (link: any) => string;
      nodeAutoColorBy?: string;
      linkDirectionalArrowLength?: number;
      linkDirectionalArrowRelPos?: number;
      onNodeClick?: (node: any, event?: MouseEvent) => void;
    }
    const ForceGraph2D: React.FC<ForceGraphProps>;
    export default ForceGraph2D;
  }
  