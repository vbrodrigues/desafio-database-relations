import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found.');
    }

    const foundProducts = await this.productsRepository.findAllById(products);

    if (foundProducts.length <= 0) {
      throw new AppError('Products not found.');
    }

    const foundProductsIds = foundProducts.map(product => product.id);

    const notFoundProducts = products.filter(
      product => !foundProductsIds.includes(product.id),
    );

    if (notFoundProducts.length > 0) {
      throw new AppError(`Product ${notFoundProducts[0].id}`);
    }

    const outOfStockProducts = products.filter(
      product =>
        foundProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (outOfStockProducts.length > 0) {
      throw new AppError(
        `Product ${outOfStockProducts[0].id} is out of stock.`,
        400,
      );
    }

    const serializedProducts = products.map(product => {
      return {
        product_id: product.id,
        price: foundProducts.filter(p => p.id === product.id)[0].price,
        quantity: product.quantity,
      };
    });

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderProducts = order_products.map(product => {
      return {
        id: product.product_id,
        quantity:
          foundProducts.filter(p => p.id === product.product_id)[0].quantity -
          product.quantity,
      };
    });

    await this.productsRepository.updateQuantity(orderProducts);

    return order;
  }
}

export default CreateOrderService;
