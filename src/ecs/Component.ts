import { IsoObject } from '../elements/IsoObject';

/**
 * Base interface for all ECS components.
 *
 * A component encapsulates a single behaviour or data facet.
 * It receives a reference to its owner entity on attachment.
 */
export interface Component {
  /** Unique type key — used to look up components by type. */
  readonly componentType: string;

  /** Called by Entity when this component is attached. */
  onAttach?(owner: IsoObject): void;

  /** Called by Entity when this component is detached. */
  onDetach?(): void;

  /** Called every frame by Scene.update(). */
  update?(ts?: number): void;
}
