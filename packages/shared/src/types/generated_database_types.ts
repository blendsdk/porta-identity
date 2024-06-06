/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

/**
 * @export
 * @interface ISysTenant
 */
export interface ISysTenant {
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	name: string;
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	database: string;
	/**
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	is_active?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	allow_reset_password?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	allow_registration?: boolean;
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	organization: string;
}

/**
 * @export
 * @interface ISysKey
 */
export interface ISysKey {
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	key_type: string;
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	key_id: string;
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	data: string;
}
